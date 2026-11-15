import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { XRAY_PRO_ENTITLEMENTS } from "@opero/shared";
import {
  isKorapayChargebackEvent,
  type KorapayChargebackEvent,
  type VerifiedCharge,
} from "@opero/payments";
import type { PrismaClient } from "@opero/database";
import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/database.constants";
import type { AuthenticatedUser } from "../types/express";

const SUBSCRIPTION_GRACE_DAYS = 3;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** Statuses that must never regain entitlements via charge.success / verify. */
const ACCESS_TERMINAL_STATUSES = new Set([
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "DISPUTED",
  "CHARGEBACK",
  "CANCELLED",
]);

/**
 * Monotonic dispute severity — out-of-order webhooks must not soften a harder state.
 * SUCCEEDED < DISPUTED < REFUNDED/PARTIAL < CHARGEBACK
 */
function disputeSeverity(status: string): number {
  switch (status) {
    case "SUCCEEDED":
      return 1;
    case "DISPUTED":
      return 2;
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return 3;
    case "CHARGEBACK":
      return 4;
    default:
      return 0;
  }
}

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

    // Pending / abandoned: never grant, and do not poison the ledger as FAILED
    // while the customer may still complete checkout (redirect-before-settle).
    if (input.verified.status === "pending" || input.verified.status === "abandoned") {
      return {
        fulfilled: false,
        paymentId: payment.id,
        status: "PENDING" as const,
      };
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

    // Never restore entitlements after refund/dispute/chargeback via a late verify.
    if (ACCESS_TERMINAL_STATUSES.has(payment.status)) {
      return {
        fulfilled: false,
        paymentId: payment.id,
        status: "ACCESS_REVOKED" as const,
        paymentStatus: payment.status,
      };
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
    const payment = await this.findPaymentByReference(input.reference);
    if (!payment) throw new BadRequestException("Unknown payment reference");

    // Chargeback is a harder terminal state — do not soften to REFUNDED.
    if (payment.status === "CHARGEBACK") {
      await this.revokePurchaseEntitlements(payment.id, payment.organizationId, "payment_chargeback");
      return { applied: false, reason: "ALREADY_CHARGEBACK" as const, paymentId: payment.id };
    }

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
    return { applied: true, paymentId: payment.id };
  }

  /**
   * Apply a documented Korapay chargeback webhook.
   * Events: chargeback.pending|declined|lost|partial|auto_accepted
   * There is no documented chargeback.won webhook — merchant-favor restore is manual.
   */
  async applyChargebackEvent(input: {
    eventType: string;
    reference: string;
    requestId?: string | null;
    providerChargebackRef?: string | null;
  }) {
    if (!isKorapayChargebackEvent(input.eventType)) {
      return { applied: false, reason: "UNKNOWN_CHARGEBACK_EVENT" as const };
    }
    const payment = await this.findPaymentByReference(input.reference);
    if (!payment) {
      return { applied: false, reason: "PAYMENT_NOT_FOUND" as const };
    }

    const event = input.eventType as KorapayChargebackEvent;
    const target =
      event === "chargeback.pending" || event === "chargeback.declined"
        ? ("DISPUTED" as const)
        : ("CHARGEBACK" as const);
    const revokeReason =
      event === "chargeback.pending"
        ? "chargeback_pending"
        : event === "chargeback.declined"
          ? "chargeback_declined_contested"
          : event === "chargeback.lost"
            ? "chargeback_lost"
            : event === "chargeback.partial"
              ? "chargeback_partial"
              : "chargeback_auto_accepted";

    if (disputeSeverity(payment.status) > disputeSeverity(target)) {
      // e.g. late pending after CHARGEBACK — keep harder state; ensure grants stay revoked.
      await this.revokePurchaseEntitlements(payment.id, payment.organizationId, revokeReason);
      return {
        applied: false,
        reason: "OUT_OF_ORDER_IGNORED" as const,
        paymentId: payment.id,
        status: payment.status,
      };
    }

    if (payment.status === target) {
      await this.revokePurchaseEntitlements(payment.id, payment.organizationId, revokeReason);
      return {
        applied: false,
        reason: "IDEMPOTENT" as const,
        paymentId: payment.id,
        status: payment.status,
      };
    }

    await this.suspendOrRevokeAccess({
      payment,
      toStatus: target,
      purchaseStatus: target === "DISPUTED" ? "DISPUTED" : "REVOKED",
      revokeReason,
      requestId: input.requestId,
      auditAction:
        target === "DISPUTED" ? "billing.payment_disputed" : "billing.payment_chargeback",
      metadata: {
        eventType: event,
        providerChargebackRef: input.providerChargebackRef ?? null,
      },
    });

    return { applied: true, paymentId: payment.id, status: target };
  }

  /**
   * Authenticated manual dispute workflow for gaps in provider webhooks
   * (notably merchant-favor resolution — no documented chargeback.won event).
   * Requires billing:manage (OWNER/ADMIN). Not a settlement bypass.
   */
  async applyManualDisputeAction(input: {
    organizationId: string;
    reference: string;
    actor: AuthenticatedUser;
    action: "open" | "confirm_chargeback" | "resolve_merchant_favor";
    reason: string;
    evidenceNote?: string | null;
    providerChargebackRef?: string | null;
    requestId?: string | null;
  }) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        organizationId: input.organizationId,
        OR: [{ reference: input.reference }, { providerReference: input.reference }],
      },
      include: { checkoutIntent: true, purchase: true },
    });
    if (!payment) {
      throw new NotFoundException({
        message: "Payment not found for organization",
        code: "PAYMENT_NOT_FOUND",
      });
    }
    if (payment.organizationId !== input.organizationId) {
      throw new ForbiddenException({
        message: "Payment does not belong to this organization",
        code: "CROSS_TENANT_PAYMENT",
      });
    }

    const fromStatus = payment.status;
    let toStatus = fromStatus;
    let revokeReason: string | null = null;
    let restore = false;

    if (input.action === "open") {
      if (!["SUCCEEDED", "DISPUTED"].includes(payment.status)) {
        throw new ConflictException({
          message: "Only succeeded (or already disputed) payments can open a dispute",
          code: "INVALID_DISPUTE_TRANSITION",
        });
      }
      toStatus = "DISPUTED";
      revokeReason = "manual_dispute_opened";
    } else if (input.action === "confirm_chargeback") {
      if (!["SUCCEEDED", "DISPUTED", "CHARGEBACK"].includes(payment.status)) {
        throw new ConflictException({
          message: "Chargeback confirm requires a succeeded or disputed payment",
          code: "INVALID_DISPUTE_TRANSITION",
        });
      }
      toStatus = "CHARGEBACK";
      revokeReason = "manual_chargeback_confirmed";
    } else if (input.action === "resolve_merchant_favor") {
      if (payment.status !== "DISPUTED") {
        throw new ConflictException({
          message: "Merchant-favor resolve is only allowed from DISPUTED (not CHARGEBACK/REFUNDED)",
          code: "INVALID_DISPUTE_TRANSITION",
        });
      }
      toStatus = "SUCCEEDED";
      restore = true;
    }

    if (toStatus !== fromStatus || restore || revokeReason) {
      if (restore) {
        await this.prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "SUCCEEDED" },
          });
          if (payment.purchase) {
            await tx.purchase.update({
              where: { id: payment.purchase.id },
              data: { status: "FULFILLED", refundedAt: null },
            });
          }
          await tx.entitlementGrant.updateMany({
            where: {
              organizationId: payment.organizationId,
              sourceType: "PURCHASE",
              sourceId: payment.id,
            },
            data: {
              revokedAt: null,
              revokeReason: null,
              validFrom: new Date(),
            },
          });
          await tx.paymentDisputeAction.create({
            data: {
              paymentId: payment.id,
              organizationId: payment.organizationId,
              actorUserId: input.actor.id,
              action: input.action,
              reason: input.reason,
              evidenceNote: input.evidenceNote ?? null,
              providerChargebackRef: input.providerChargebackRef ?? null,
              fromStatus,
              toStatus,
              requestId: input.requestId ?? null,
            },
          });
        });
      } else if (revokeReason) {
        await this.suspendOrRevokeAccess({
          payment,
          toStatus: toStatus as "DISPUTED" | "CHARGEBACK",
          purchaseStatus: toStatus === "DISPUTED" ? "DISPUTED" : "REVOKED",
          revokeReason,
          requestId: input.requestId,
          auditAction:
            toStatus === "DISPUTED" ? "billing.payment_disputed" : "billing.payment_chargeback",
          metadata: {
            manual: true,
            action: input.action,
            providerChargebackRef: input.providerChargebackRef ?? null,
          },
        });
        await this.prisma.paymentDisputeAction.create({
          data: {
            paymentId: payment.id,
            organizationId: payment.organizationId,
            actorUserId: input.actor.id,
            action: input.action,
            reason: input.reason,
            evidenceNote: input.evidenceNote ?? null,
            providerChargebackRef: input.providerChargebackRef ?? null,
            fromStatus,
            toStatus,
            requestId: input.requestId ?? null,
          },
        });
      }
    }

    await this.audit.record({
      action: "billing.payment_dispute_manual",
      entityType: "payment",
      entityId: payment.id,
      organizationId: payment.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: {
        action: input.action,
        reason: input.reason,
        evidenceNote: input.evidenceNote ?? null,
        providerChargebackRef: input.providerChargebackRef ?? null,
        fromStatus,
        toStatus,
        limitation:
          "Previously downloaded PDF files cannot be remotely recalled; only subsequent downloads are blocked.",
      },
    });

    return {
      paymentId: payment.id,
      reference: payment.reference,
      fromStatus,
      toStatus,
      action: input.action,
    };
  }

  private async suspendOrRevokeAccess(input: {
    payment: {
      id: string;
      organizationId: string;
      reference: string;
      purchase: { id: string } | null;
    };
    toStatus: "DISPUTED" | "CHARGEBACK";
    purchaseStatus: "DISPUTED" | "REVOKED";
    revokeReason: string;
    requestId?: string | null;
    auditAction: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: input.payment.id },
        data: {
          status: input.toStatus,
          ...(input.toStatus === "CHARGEBACK" ? { refundedAt: new Date() } : {}),
        },
      });
      if (input.payment.purchase) {
        await tx.purchase.update({
          where: { id: input.payment.purchase.id },
          data: {
            status: input.purchaseStatus,
            ...(input.toStatus === "CHARGEBACK" ? { refundedAt: new Date() } : {}),
          },
        });
      }
      await tx.entitlementGrant.updateMany({
        where: {
          organizationId: input.payment.organizationId,
          sourceType: "PURCHASE",
          sourceId: input.payment.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          revokeReason: input.revokeReason,
        },
      });
    });

    await this.audit.record({
      action: input.auditAction,
      entityType: "payment",
      entityId: input.payment.id,
      organizationId: input.payment.organizationId,
      requestId: input.requestId,
      metadata: {
        reference: input.payment.reference,
        toStatus: input.toStatus,
        revokeReason: input.revokeReason,
        limitation:
          "Previously downloaded PDF files cannot be remotely recalled; only subsequent downloads are blocked.",
        ...input.metadata,
      },
    });
  }

  private async revokePurchaseEntitlements(
    paymentId: string,
    organizationId: string,
    revokeReason: string,
  ) {
    await this.prisma.entitlementGrant.updateMany({
      where: {
        organizationId,
        sourceType: "PURCHASE",
        sourceId: paymentId,
        revokedAt: null,
      },
      data: { revokedAt: new Date(), revokeReason },
    });
  }

  /** Match merchant reference or provider reference (chargeback payloads vary). */
  private async findPaymentByReference(reference: string) {
    if (!reference) return null;
    return this.prisma.payment.findFirst({
      where: {
        OR: [{ reference }, { providerReference: reference }],
      },
      include: { checkoutIntent: true, purchase: true },
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
