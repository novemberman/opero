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
import {
  buildKorapayNotificationUrl,
  minorToMajorUnits,
  MockKorapayProvider,
  type MockChargeState,
} from "@opero/payments";
import { AuditService } from "../audit/audit.service";
import { resolveAppEnv, type ApiEnv } from "../config/env";
import { PRISMA_CLIENT } from "../database/database.constants";
import type { AuthenticatedUser } from "../types/express";
import { CatalogService } from "./catalog.service";
import { FulfillmentService } from "./fulfillment.service";
import { PAYMENT_PROVIDER } from "./payment.tokens";

const CHECKOUT_TTL_MS = 60 * 60 * 1000;
const MOCK_SETTLE_OUTCOMES = ["success", "failed", "abandoned"] as const;
type MockSettleOutcome = (typeof MOCK_SETTLE_OUTCOMES)[number];

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

  private assertCheckoutEnabled(): void {
    if (this.config.get("EMERGENCY_DISABLE_CHECKOUT", { infer: true })) {
      throw new BadRequestException({
        message: "Checkout is temporarily disabled by the operator.",
        code: "EMERGENCY_DISABLE_CHECKOUT",
      });
    }
  }

  async startXrayProCheckout(input: {
    organizationId: string;
    actor: AuthenticatedUser;
    reportId: string;
    idempotencyKey: string;
    redirectUrl?: string;
    requestId?: string;
  }) {
    this.assertCheckoutEnabled();
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
      return this.toCheckoutResponse(existing, {
        organizationId: input.organizationId,
        reportId: existing.reportId,
      });
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
        provider: this.payments.name,
      },
    });

    return this.toCheckoutResponse(intent, {
      organizationId: input.organizationId,
      reportId: input.reportId,
    });
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
    this.assertCheckoutEnabled();
    const existing = await this.prisma.checkoutIntent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.organizationId !== input.organizationId) {
        throw new ForbiddenException("Idempotency key belongs to another organization");
      }
      return this.toCheckoutResponse(existing, {
        organizationId: input.organizationId,
        reportId: existing.reportId,
      });
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

    return this.toCheckoutResponse(intent, {
      organizationId: input.organizationId,
      reportId: null,
    });
  }

  /**
   * Staging/local mock settlement. Settles the in-memory mock charge then runs
   * the same verify+fulfill path as production. Unavailable unless the live
   * payment provider is mock (forbidden in production by env validation).
   */
  async mockSettleAndFulfill(input: {
    organizationId: string;
    reference: string;
    outcome: MockSettleOutcome;
    actor: AuthenticatedUser;
    requestId?: string;
  }) {
    // Defense in depth: production must never expose mock settlement even if misconfigured.
    if (
      resolveAppEnv({
        APP_ENV: this.config.get("APP_ENV", { infer: true }),
        NODE_ENV: this.config.get("NODE_ENV", { infer: true }),
      }) === "production"
    ) {
      throw new NotFoundException();
    }
    if (this.payments.name !== "mock" || !(this.payments instanceof MockKorapayProvider)) {
      // Do not advertise a settlement bypass when Korapay (or any non-mock) is live.
      throw new NotFoundException();
    }
    if (!MOCK_SETTLE_OUTCOMES.includes(input.outcome)) {
      throw new BadRequestException("Invalid mock settlement outcome");
    }

    const payment = await this.prisma.payment.findFirst({
      where: { reference: input.reference, organizationId: input.organizationId },
      include: { checkoutIntent: true },
    });
    if (!payment) throw new NotFoundException("Payment not found");

    try {
      this.payments.settle(input.reference, input.outcome as MockChargeState["status"]);
    } catch {
      throw new BadRequestException({
        message: "Mock charge is unknown or cannot be settled",
        code: "MOCK_CHARGE_UNKNOWN",
      });
    }

    await this.audit.record({
      action: "billing.mock_settled",
      entityType: "payment",
      entityId: payment.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: {
        reference: input.reference,
        outcome: input.outcome,
        purpose: payment.checkoutIntent.purpose,
        reportId: payment.checkoutIntent.reportId,
        // Never log checkout URLs, secrets, or storage keys.
      },
    });

    return this.verifyAndFulfill({
      organizationId: input.organizationId,
      reference: input.reference,
      actor: input.actor,
      requestId: input.requestId,
    });
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
        status:
          result.status === "FULFILLED" || result.status === "ALREADY_FULFILLED"
            ? "SUCCEEDED"
            : result.status === "FAILED"
              ? "FAILED"
              : result.status === "PENDING"
                ? "PENDING"
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
    return this.toCheckoutResponse(intent, {
      organizationId,
      reportId: intent.reportId,
    });
  }

  private toCheckoutResponse(
    intent: {
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
    },
    ctx: { organizationId: string; reportId: string | null },
  ) {
    const mockSettlementAvailable = this.payments.name === "mock";
    const checkoutUrl = mockSettlementAvailable
      ? this.mockCheckoutUrl({
          organizationId: ctx.organizationId,
          reference: intent.paymentReference,
          reportId: ctx.reportId ?? intent.reportId,
          checkoutId: intent.id,
        })
      : intent.checkoutUrl;

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
        checkoutUrl,
        reference: intent.paymentReference,
        expiresAt: intent.expiresAt,
        pricingVersionCode: intent.pricingVersionCode,
        provider: this.payments.name,
        mockSettlementAvailable,
        // Explicit: redirect is not confirmation of payment.
        paymentConfirmed: intent.status === "SUCCEEDED",
      },
    };
  }

  /** Browser-facing mock pay page on the web app — never a public settle bypass. */
  private mockCheckoutUrl(input: {
    organizationId: string;
    reference: string;
    reportId: string | null;
    checkoutId: string;
  }): string {
    const origin = this.config.get("APP_ORIGIN", { infer: true }).replace(/\/$/, "");
    const params = new URLSearchParams({
      reference: input.reference,
      checkoutId: input.checkoutId,
    });
    if (input.reportId) params.set("reportId", input.reportId);
    return `${origin}/organizations/${input.organizationId}/billing/mock-pay?${params.toString()}`;
  }
}
