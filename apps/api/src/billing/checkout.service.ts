import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@opero/database";
import type { PaymentProvider } from "@opero/payments";
import { buildKorapayNotificationUrl, minorToMajorUnits } from "@opero/payments";
import { AuditService } from "../audit/audit.service";
import type { ApiEnv } from "../config/env";
import { PRISMA_CLIENT } from "../database/database.constants";
import type { AuthenticatedUser } from "../types/express";
import { CatalogService } from "./catalog.service";
import { FulfillmentService } from "./fulfillment.service";
import { PAYMENT_PROVIDER } from "./payment.tokens";

const CHECKOUT_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly catalog: CatalogService,
    private readonly fulfillment: FulfillmentService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<ApiEnv, true>,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
  ) {}

  /** Public Korapay notification_url when BILLING_WEBHOOK_BASE_URL is set. */
  private notificationUrl(): string | undefined {
    return buildKorapayNotificationUrl(
      this.config.get("BILLING_WEBHOOK_BASE_URL", { infer: true }),
    );
  }

  async startXrayProCheckout(input: {
    organizationId: string;
    actor: AuthenticatedUser;
    reportId: string;
    idempotencyKey: string;
    redirectUrl?: string;
    requestId?: string;
  }) {
    const report = await this.prisma.xRayReport.findFirst({
      where: { id: input.reportId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!report) throw new NotFoundException("Report not found");

    const existing = await this.prisma.checkoutIntent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { payment: true },
    });
    if (existing) {
      if (existing.organizationId !== input.organizationId) {
        throw new ForbiddenException("Idempotency key belongs to another organization");
      }
      return this.toCheckoutResponse(existing);
    }

    const { version, product, price } =
      await this.catalog.requireActivePriceByProductCode("XRAY_PRO");
    if (price.amountMinor <= 0) {
      throw new BadRequestException("X-Ray Pro price is not configured");
    }

    const reference = `opero_${randomUUID().replace(/-/g, "")}`;
    const expiresAt = new Date(Date.now() + CHECKOUT_TTL_MS);

    const initialized = await this.payments.initializeCheckout({
      reference,
      amountMinor: price.amountMinor,
      currency: price.currency,
      customerEmail: input.actor.email,
      customerName: input.actor.name,
      redirectUrl: input.redirectUrl,
      notificationUrl: this.notificationUrl(),
      narration: `Opero X-Ray Pro report ${input.reportId}`,
      metadata: {
        org: input.organizationId.slice(0, 20),
        purpose: "xray-pro",
      },
    });

    const intent = await this.prisma.$transaction(async (tx) => {
      const created = await tx.checkoutIntent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actor.id,
          purpose: "XRAY_PRO_REPORT",
          status: "REDIRECTED",
          priceId: price.id,
          amountMinor: price.amountMinor,
          currency: price.currency,
          pricingVersionCode: version.code,
          productCode: product.code,
          reportId: input.reportId,
          idempotencyKey: input.idempotencyKey,
          paymentReference: initialized.reference,
          provider: this.payments.name,
          checkoutUrl: initialized.checkoutUrl,
          customerEmail: input.actor.email,
          customerName: input.actor.name,
          redirectUrl: input.redirectUrl ?? null,
          expiresAt,
        },
      });
      await tx.payment.create({
        data: {
          organizationId: input.organizationId,
          checkoutIntentId: created.id,
          reference: initialized.reference,
          provider: this.payments.name,
          status: "PENDING",
          amountMinor: price.amountMinor,
          currency: price.currency,
        },
      });
      return created;
    });

    await this.audit.record({
      action: "billing.checkout_created",
      entityType: "checkout_intent",
      entityId: intent.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: {
        purpose: intent.purpose,
        productCode: product.code,
        amountMinor: price.amountMinor,
        currency: price.currency,
        amountMajor: minorToMajorUnits(price.amountMinor, price.currency),
        reportId: input.reportId,
        reference: initialized.reference,
        pricingVersion: version.code,
      },
    });

    return this.toCheckoutResponse(intent);
  }

  async startSubscriptionCheckout(input: {
    organizationId: string;
    actor: AuthenticatedUser;
    planCode: "OS_STARTER" | "OS_GROWTH";
    purpose: "SUBSCRIPTION_START" | "SUBSCRIPTION_RENEW";
    subscriptionId?: string;
    idempotencyKey: string;
    redirectUrl?: string;
    requestId?: string;
  }) {
    const existing = await this.prisma.checkoutIntent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.organizationId !== input.organizationId) {
        throw new ForbiddenException("Idempotency key belongs to another organization");
      }
      return this.toCheckoutResponse(existing);
    }

    const { version, product, price, plan } =
      await this.catalog.requireActivePriceByProductCode(input.planCode);
    if (!plan) throw new NotFoundException(`Plan ${input.planCode} not found`);

    if (input.purpose === "SUBSCRIPTION_RENEW") {
      if (!input.subscriptionId) {
        throw new BadRequestException("subscriptionId required for renewal");
      }
      const sub = await this.prisma.subscription.findFirst({
        where: { id: input.subscriptionId, organizationId: input.organizationId },
      });
      if (!sub) throw new NotFoundException("Subscription not found");
    }

    const reference = `opero_${randomUUID().replace(/-/g, "")}`;
    const initialized = await this.payments.initializeCheckout({
      reference,
      amountMinor: price.amountMinor,
      currency: price.currency,
      customerEmail: input.actor.email,
      customerName: input.actor.name,
      redirectUrl: input.redirectUrl,
      notificationUrl: this.notificationUrl(),
      narration: `Opero ${plan.code} ${input.purpose === "SUBSCRIPTION_RENEW" ? "renewal" : "subscription"}`,
      metadata: {
        plan: plan.code.slice(0, 20),
        purpose: input.purpose === "SUBSCRIPTION_RENEW" ? "sub-renew" : "sub-start",
      },
    });

    const intent = await this.prisma.$transaction(async (tx) => {
      const created = await tx.checkoutIntent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actor.id,
          purpose: input.purpose,
          status: "REDIRECTED",
          priceId: price.id,
          amountMinor: price.amountMinor,
          currency: price.currency,
          pricingVersionCode: version.code,
          productCode: product.code,
          planId: plan.id,
          subscriptionId: input.subscriptionId ?? null,
          idempotencyKey: input.idempotencyKey,
          paymentReference: initialized.reference,
          provider: this.payments.name,
          checkoutUrl: initialized.checkoutUrl,
          customerEmail: input.actor.email,
          customerName: input.actor.name,
          redirectUrl: input.redirectUrl ?? null,
          expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
        },
      });
      await tx.payment.create({
        data: {
          organizationId: input.organizationId,
          checkoutIntentId: created.id,
          reference: initialized.reference,
          provider: this.payments.name,
          status: "PENDING",
          amountMinor: price.amountMinor,
          currency: price.currency,
        },
      });
      return created;
    });

    await this.audit.record({
      action: "billing.checkout_created",
      entityType: "checkout_intent",
      entityId: intent.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: {
        purpose: intent.purpose,
        planCode: plan.code,
        amountMinor: price.amountMinor,
        currency: price.currency,
        reference: initialized.reference,
      },
    });

    return this.toCheckoutResponse(intent);
  }

  /**
   * Server-side verification entry point. Client may supply the reference from
   * redirect, but success is decided only after provider verify + amount checks.
   */
  async verifyAndFulfill(input: {
    organizationId: string;
    reference: string;
    actor: AuthenticatedUser;
    requestId?: string;
  }) {
    const payment = await this.prisma.payment.findFirst({
      where: { reference: input.reference, organizationId: input.organizationId },
      include: { checkoutIntent: true },
    });
    if (!payment) throw new NotFoundException("Payment not found");

    const verified = await this.payments.verifyTransaction(input.reference);
    const result = await this.fulfillment.fulfillVerifiedPayment({
      reference: input.reference,
      verified,
      requestId: input.requestId,
    });

    await this.audit.record({
      action: "billing.payment_verified",
      entityType: "payment",
      entityId: payment.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: {
        reference: input.reference,
        providerStatus: verified.status,
        fulfillment: result.status,
      },
    });

    return {
      payment: {
        id: payment.id,
        reference: payment.reference,
        status: result.status === "FULFILLED" || result.status === "ALREADY_FULFILLED"
          ? "SUCCEEDED"
          : result.status === "FAILED"
            ? "FAILED"
            : payment.status,
      },
      fulfillment: result,
      // Never claim success from the client redirect alone.
      providerStatus: verified.status,
    };
  }

  async getCheckout(organizationId: string, checkoutId: string) {
    const intent = await this.prisma.checkoutIntent.findFirst({
      where: { id: checkoutId, organizationId },
      include: { payment: true },
    });
    if (!intent) throw new NotFoundException("Checkout not found");
    return this.toCheckoutResponse(intent);
  }

  private toCheckoutResponse(intent: {
    id: string;
    status: string;
    purpose: string;
    amountMinor: number;
    currency: string;
    productCode: string;
    reportId: string | null;
    checkoutUrl: string | null;
    paymentReference: string;
    expiresAt: Date;
    pricingVersionCode: string;
  }) {
    return {
      checkout: {
        id: intent.id,
        status: intent.status,
        purpose: intent.purpose,
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        amountDisplayMajor: minorToMajorUnits(intent.amountMinor, intent.currency),
        productCode: intent.productCode,
        reportId: intent.reportId,
        checkoutUrl: intent.checkoutUrl,
        reference: intent.paymentReference,
        expiresAt: intent.expiresAt,
        pricingVersionCode: intent.pricingVersionCode,
        // Explicit: redirect is not confirmation of payment.
        paymentConfirmed: intent.status === "SUCCEEDED",
      },
    };
  }
}
