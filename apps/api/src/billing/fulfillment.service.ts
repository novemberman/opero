import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { XRAY_PRO_ENTITLEMENTS } from "@opero/shared";
import type { VerifiedCharge } from "@opero/payments";
import type { PrismaClient } from "@opero/database";
import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/database.constants";

const SUBSCRIPTION_GRACE_DAYS = 3;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class FulfillmentService {
  private readonly logger = new Logger(FulfillmentService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  /**
   * Idempotent fulfillment after server-side verification.
   * Never trusts client-reported success alone.
   */
  async fulfillVerifiedPayment(input: {
    reference: string;
    verified: VerifiedCharge;
    requestId?: string | null;
  }) {
    const payment = await this.prisma.payment.findUnique({
      where: { reference: input.reference },
      include: { checkoutIntent: true, purchase: true },
    });
    if (!payment) {
      throw new BadRequestException("Unknown payment reference");
    }

    if (input.verified.currency.toUpperCase() !== payment.currency.toUpperCase()) {
      await this.markFailed(payment.id, "CURRENCY_MISMATCH");
      throw new ConflictException({
        message: "Payment currency mismatch",
        code: "CURRENCY_MISMATCH",
      });
    }
    if (input.verified.amountMinor !== payment.amountMinor) {
      await this.markFailed(payment.id, "AMOUNT_MISMATCH");
      throw new ConflictException({
        message: "Payment amount mismatch",
        code: "AMOUNT_MISMATCH",
      });
    }

    if (input.verified.status !== "success") {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          rawVerifySnapshot: input.verified.raw as object,
        },
      });
      await this.prisma.checkoutIntent.update({
        where: { id: payment.checkoutIntentId },
        data: { status: "FAILED" },
      });
      return { fulfilled: false, paymentId: payment.id, status: "FAILED" as const };
    }

    if (payment.status === "SUCCEEDED" && payment.fulfilledAt) {
      return { fulfilled: false, paymentId: payment.id, status: "ALREADY_FULFILLED" as const };
    }

    // Claim exclusive fulfillment lock — concurrent verifiers lose.
    const lock = `fulfill:${payment.id}`;
    const claimed = await this.prisma.payment.updateMany({
      where: { id: payment.id, fulfillmentLock: null },
      data: { fulfillmentLock: lock },
    });
    if (claimed.count === 0) {
      // Brief wait for the winner to finish so concurrent verifies converge
      // on ALREADY_FULFILLED instead of thrashing FULFILLMENT_IN_PROGRESS.
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        const latest = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
        if (latest.fulfilledAt) {
          return { fulfilled: false, paymentId: payment.id, status: "ALREADY_FULFILLED" as const };
        }
        if (!latest.fulfillmentLock) break;
      }
      const latest = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (latest.fulfilledAt) {
        return { fulfilled: false, paymentId: payment.id, status: "ALREADY_FULFILLED" as const };
      }
      throw new ConflictException({
        message: "Payment fulfillment already in progress",
        code: "FULFILLMENT_IN_PROGRESS",
      });
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const intent = payment.checkoutIntent;
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "SUCCEEDED",
            paidAt: new Date(),
            amountPaidMinor: input.verified.amountMinor,
            feeMinor: input.verified.feeMinor ?? null,
            providerReference: input.verified.providerReference ?? input.reference,
            rawVerifySnapshot: input.verified.raw as object,
          },
        });
        await tx.checkoutIntent.update({
          where: { id: intent.id },
          data: { status: "SUCCEEDED" },
        });

        if (intent.purpose === "XRAY_PRO_REPORT") {
          if (!intent.reportId) {
            throw new BadRequestException("Checkout missing reportId");
          }
          const purchase = await tx.purchase.upsert({
            where: { paymentId: payment.id },
            create: {
              organizationId: payment.organizationId,
              actorUserId: intent.actorUserId,
              checkoutIntentId: intent.id,
              paymentId: payment.id,
              priceId: intent.priceId,
              reportId: intent.reportId,
              productCode: intent.productCode,
              amountMinor: payment.amountMinor,
              currency: payment.currency,
              status: "FULFILLED",
              fulfilledAt: new Date(),
            },
            update: {
              status: "FULFILLED",
              fulfilledAt: new Date(),
            },
          });

          for (const code of XRAY_PRO_ENTITLEMENTS) {
            await tx.entitlementGrant.upsert({
              where: {
                organizationId_code_scopeType_scopeId_sourceId: {
                  organizationId: payment.organizationId,
                  code,
                  scopeType: "REPORT",
                  scopeId: intent.reportId,
                  sourceId: payment.id,
                },
              },
              create: {
                organizationId: payment.organizationId,
                code,
                scopeType: "REPORT",
                scopeId: intent.reportId,
                sourceType: "PURCHASE",
                sourceId: payment.id,
                validFrom: new Date(),
                validUntil: null,
              },
              update: {
                revokedAt: null,
                revokeReason: null,
                validFrom: new Date(),
                validUntil: null,
              },
            });
          }

          await tx.payment.update({
            where: { id: payment.id },
            data: { fulfilledAt: new Date() },
          });

          return { kind: "purchase" as const, purchaseId: purchase.id, reportId: intent.reportId };
        }

        if (
          intent.purpose === "SUBSCRIPTION_START" ||
          intent.purpose === "SUBSCRIPTION_RENEW"
        ) {
          if (!intent.planId) {
            throw new BadRequestException("Checkout missing planId");
          }
          const plan = await tx.plan.findUniqueOrThrow({
            where: { id: intent.planId },
            include: { entitlements: true },
          });
          const periodStart = new Date();
          const periodEnd = new Date(periodStart.getTime() + MONTH_MS);
          const graceUntil = new Date(
            periodEnd.getTime() + SUBSCRIPTION_GRACE_DAYS * 24 * 60 * 60 * 1000,
          );

          let subscriptionId = intent.subscriptionId;
          if (intent.purpose === "SUBSCRIPTION_START" || !subscriptionId) {
            const created = await tx.subscription.create({
              data: {
                organizationId: payment.organizationId,
                actorUserId: intent.actorUserId,
                planId: plan.id,
                priceId: intent.priceId,
                status: "ACTIVE",
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                graceUntil,
                originPaymentId: payment.id,
                amountMinorSnapshot: payment.amountMinor,
                currencySnapshot: payment.currency,
                pricingVersionCode: intent.pricingVersionCode,
              },
            });
            subscriptionId = created.id;
            await tx.subscriptionEvent.create({
              data: {
                subscriptionId: created.id,
                organizationId: payment.organizationId,
                fromStatus: "PENDING_PAYMENT",
                toStatus: "ACTIVE",
                reason: "checkout_fulfilled",
              },
            });
          } else {
            const existing = await tx.subscription.findFirstOrThrow({
              where: { id: subscriptionId, organizationId: payment.organizationId },
            });
            await tx.subscription.update({
              where: { id: existing.id },
              data: {
                status: "ACTIVE",
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                graceUntil,
                cancelAtPeriodEnd: false,
                canceledAt: null,
              },
            });
            await tx.subscriptionEvent.create({
              data: {
                subscriptionId: existing.id,
                organizationId: payment.organizationId,
                fromStatus: existing.status,
                toStatus: "ACTIVE",
                reason: "manual_renewal_fulfilled",
              },
            });
          }

          for (const row of plan.entitlements) {
            if (row.entitlementCode === "xray.preview") continue;
            await tx.entitlementGrant.upsert({
              where: {
                organizationId_code_scopeType_scopeId_sourceId: {
                  organizationId: payment.organizationId,
                  code: row.entitlementCode,
                  scopeType: "ORGANIZATION",
                  scopeId: payment.organizationId,
                  sourceId: subscriptionId!,
                },
              },
              create: {
                organizationId: payment.organizationId,
                code: row.entitlementCode,
                scopeType: "ORGANIZATION",
                scopeId: payment.organizationId,
                sourceType: "SUBSCRIPTION",
                sourceId: subscriptionId!,
                limitValue: row.limitValue,
                validFrom: periodStart,
                validUntil: graceUntil,
              },
              update: {
                revokedAt: null,
                revokeReason: null,
                limitValue: row.limitValue,
                validFrom: periodStart,
                validUntil: graceUntil,
              },
            });
          }

          await tx.checkoutIntent.update({
            where: { id: intent.id },
            data: { subscriptionId },
          });
          await tx.payment.update({
            where: { id: payment.id },
            data: { fulfilledAt: new Date() },
          });

          return { kind: "subscription" as const, subscriptionId: subscriptionId! };
        }

        throw new BadRequestException(`Unsupported checkout purpose ${intent.purpose}`);
      });

      await this.audit.record({
        action: "billing.payment_fulfilled",
        entityType: "payment",
        entityId: payment.id,
        organizationId: payment.organizationId,
        actorUserId: payment.checkoutIntent.actorUserId,
        requestId: input.requestId,
        metadata: {
          reference: payment.reference,
          purpose: payment.checkoutIntent.purpose,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          result,
        },
      });

      return { fulfilled: true, paymentId: payment.id, status: "FULFILLED" as const, result };
    } catch (error) {
      // Release lock so a safe retry can proceed after fixing transient errors.
      await this.prisma.payment
        .update({
          where: { id: payment.id },
          data: { fulfillmentLock: null },
        })
        .catch((releaseError) => {
          this.logger.warn(`Failed to release fulfillment lock: ${String(releaseError)}`);
        });
      throw error;
    }
  }

  async applyRefund(input: {
    reference: string;
    requestId?: string | null;
  }) {
    const payment = await this.prisma.payment.findUnique({
      where: { reference: input.reference },
      include: { checkoutIntent: true, purchase: true },
    });
    if (!payment) throw new BadRequestException("Unknown payment reference");

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "REFUNDED", refundedAt: new Date() },
      });
      if (payment.purchase) {
        await tx.purchase.update({
          where: { id: payment.purchase.id },
          data: { status: "REFUNDED", refundedAt: new Date() },
        });
      }
      await tx.entitlementGrant.updateMany({
        where: {
          organizationId: payment.organizationId,
          sourceType: "PURCHASE",
          sourceId: payment.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          revokeReason: "payment_refunded",
        },
      });
    });

    await this.audit.record({
      action: "billing.payment_refunded",
      entityType: "payment",
      entityId: payment.id,
      organizationId: payment.organizationId,
      requestId: input.requestId,
      metadata: { reference: payment.reference },
    });
  }

  private async markFailed(paymentId: string, reason: string) {
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: "FAILED", failedAt: new Date() },
    });
    await this.audit.record({
      action: "billing.payment_rejected",
      entityType: "payment",
      entityId: paymentId,
      metadata: { reason },
    });
  }
}
