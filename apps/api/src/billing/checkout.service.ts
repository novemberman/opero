import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@opero/database";
import type { PaymentProvider } from "@opero/payments";
import {
  buildKorapayNotificationUrl,
  isAmbiguousPaymentInitError,
  minorToMajorUnits,
  MockKorapayProvider,
  PaymentInitError,
  type MockChargeState,
} from "@opero/payments";
import { LIVE_PILOT_AMOUNT_MINOR, LIVE_PILOT_PRODUCT_CODE } from "@opero/shared";
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

const LIVE_PILOT_ACTIVE_STATUSES = ["CREATED", "REDIRECTED", "PENDING_PAYMENT"] as const;

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

  /** Canonical browser return after hosted checkout (Korapay appends ?reference=). */
  defaultRedirectUrl(): string {
    const origin = this.config.get("APP_ORIGIN", { infer: true }).replace(/\/$/, "");
    return `${origin}/billing/return`;
  }

  /**
   * Prefer caller redirect when same-origin as APP_ORIGIN; otherwise default.
   * Rejects open redirects to foreign origins.
   */
  resolveRedirectUrl(redirectUrl?: string | null): string {
    const fallback = this.defaultRedirectUrl();
    if (!redirectUrl?.trim()) return fallback;
    let parsed: URL;
    try {
      parsed = new URL(redirectUrl.trim());
    } catch {
      throw new BadRequestException({
        message: "redirectUrl is not a valid URL",
        code: "INVALID_REDIRECT_URL",
      });
    }
    const origin = new URL(this.config.get("APP_ORIGIN", { infer: true }));
    if (parsed.origin !== origin.origin) {
      throw new BadRequestException({
        message: "redirectUrl must match APP_ORIGIN",
        code: "INVALID_REDIRECT_ORIGIN",
      });
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new BadRequestException({
        message: "redirectUrl protocol not allowed",
        code: "INVALID_REDIRECT_URL",
      });
    }
    return parsed.toString();
  }

  /**
   * Authenticated lookup so `/billing/return?reference=` can route to the org
   * billing page. Does not verify with the provider or grant entitlements.
   */
  async returnContext(input: { reference: string; actor: AuthenticatedUser }) {
    const reference = input.reference.trim();
    if (reference.length < 8 || reference.length > 120) {
      throw new NotFoundException("Payment not found");
    }

    const payment = await this.prisma.payment.findFirst({
      where: { reference },
      select: {
        id: true,
        reference: true,
        status: true,
        organizationId: true,
        fulfilledAt: true,
        checkoutIntent: {
          select: {
            reportId: true,
            purpose: true,
            productCode: true,
            status: true,
            expiresAt: true,
          },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException("Payment not found");
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: payment.organizationId,
          userId: input.actor.id,
        },
      },
      select: { role: true },
    });
    if (!membership) {
      // Do not leak whether the reference exists in another org.
      throw new NotFoundException("Payment not found");
    }

    const intent = payment.checkoutIntent;
    const expired =
      intent != null &&
      intent.expiresAt.getTime() < Date.now() &&
      payment.status === "PENDING" &&
      intent.status !== "SUCCEEDED";

    return {
      reference: payment.reference,
      organizationId: payment.organizationId,
      reportId: intent?.reportId ?? null,
      paymentStatus: payment.status,
      checkoutStatus: intent?.status ?? null,
      purpose: intent?.purpose ?? null,
      productCode: intent?.productCode ?? null,
      fulfilled: payment.fulfilledAt != null,
      expired,
      // Explicit: browser return is not payment confirmation.
      paymentConfirmed: payment.status === "SUCCEEDED" && payment.fulfilledAt != null,
    };
  }

  private assertCheckoutEnabled(): void {
    if (this.config.get("EMERGENCY_DISABLE_CHECKOUT", { infer: true })) {
      throw new BadRequestException({
        message: "Checkout is temporarily disabled by the operator.",
        code: "EMERGENCY_DISABLE_CHECKOUT",
      });
    }
  }

  /** When the live-pilot window is armed, block public catalog checkouts. */
  private assertNotLivePilotLocked(): void {
    if (this.config.get("LIVE_PILOT_ENABLED", { infer: true })) {
      throw new BadRequestException({
        message: "Public checkout is locked during the live-pilot window.",
        code: "LIVE_PILOT_LOCK",
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
    this.assertNotLivePilotLocked();
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
    const redirectUrl = this.resolveRedirectUrl(input.redirectUrl);

    const initialized = await this.payments.initializeCheckout({
      reference,
      amountMinor: price.amountMinor,
      currency: price.currency,
      customerEmail: input.actor.email,
      customerName: input.actor.name,
      redirectUrl,
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
          redirectUrl,
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

  /**
   * Hidden ₦100 live-pilot checkout. Kill switch always wins.
   * Only the env-allowlisted org/report may charge; public XRAY_PRO stays ₦15,000.
   *
   * Concurrency (A12-P3-R2): reserve intent+payment in a serialized DB transaction
   * *before* any Korapay initializeCheckout call so competing requests cannot double-initiate.
   */
  async startLivePilotCheckout(input: {
    organizationId: string;
    actor: AuthenticatedUser;
    reportId: string;
    idempotencyKey: string;
    redirectUrl?: string;
    requestId?: string;
  }) {
    // Global kill switch always takes precedence over LIVE_PILOT_ENABLED.
    this.assertCheckoutEnabled();

    if (!this.config.get("LIVE_PILOT_ENABLED", { infer: true })) {
      throw new BadRequestException({
        message: "Live pilot checkout is disabled.",
        code: "LIVE_PILOT_DISABLED",
      });
    }

    const expiresAtRaw = this.config.get("LIVE_PILOT_EXPIRES_AT", { infer: true });
    if (!expiresAtRaw) {
      throw new BadRequestException({
        message: "Live pilot window expiry is not configured.",
        code: "LIVE_PILOT_NOT_CONFIGURED",
      });
    }
    const windowExpiresAt = new Date(expiresAtRaw);
    if (Number.isNaN(windowExpiresAt.getTime()) || windowExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        message: "Live pilot checkout window has expired.",
        code: "LIVE_PILOT_EXPIRED",
      });
    }

    const allowedOrg = this.config.get("LIVE_PILOT_ORG_ID", { infer: true });
    const allowedReport = this.config.get("LIVE_PILOT_REPORT_ID", { infer: true });
    if (!allowedOrg || !allowedReport) {
      throw new BadRequestException({
        message: "Live pilot allowlist is not configured.",
        code: "LIVE_PILOT_NOT_CONFIGURED",
      });
    }
    if (input.organizationId !== allowedOrg || input.reportId !== allowedReport) {
      throw new ForbiddenException({
        message: "Live pilot checkout is not authorized for this organization or report.",
        code: "LIVE_PILOT_FORBIDDEN",
      });
    }

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
      return this.livePilotIdempotentReplay(existing, input.organizationId);
    }

    const { version, product, price } = await this.catalog.requireLivePilotProbePrice();
    if (price.amountMinor !== LIVE_PILOT_AMOUNT_MINOR) {
      throw new BadRequestException({
        message: "Live pilot amount misconfigured.",
        code: "LIVE_PILOT_AMOUNT_INVALID",
      });
    }

    const reference = `opero_${randomUUID().replace(/-/g, "")}`;
    const expiresAt = new Date(Date.now() + CHECKOUT_TTL_MS);
    const redirectUrl = this.resolveRedirectUrl(input.redirectUrl);
    const maxSuccesses = this.config.get("LIVE_PILOT_MAX_SUCCESSES", { infer: true });

    // Commit reservation before any external provider call.
    const reserved = await this.prisma.$transaction(async (tx) => {
      const lockKey = `live-pilot:${input.organizationId}:${input.reportId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const raced = await tx.checkoutIntent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { payment: true },
      });
      if (raced) {
        return { kind: "replay" as const, intent: raced };
      }

      const successCount = await tx.payment.count({
        where: {
          organizationId: input.organizationId,
          status: "SUCCEEDED",
          checkoutIntent: {
            productCode: LIVE_PILOT_PRODUCT_CODE,
            reportId: input.reportId,
          },
        },
      });
      if (successCount >= maxSuccesses) {
        throw new BadRequestException({
          message: "Live pilot payment success limit reached.",
          code: "LIVE_PILOT_MAX_SUCCESSES",
        });
      }

      await this.expireStaleLivePilotAttempts(tx, input.organizationId, input.reportId);

      const pending = await tx.checkoutIntent.findFirst({
        where: {
          organizationId: input.organizationId,
          reportId: input.reportId,
          productCode: LIVE_PILOT_PRODUCT_CODE,
          status: { in: [...LIVE_PILOT_ACTIVE_STATUSES] },
          payment: { status: "PENDING" },
        },
      });
      if (pending) {
        throw new ConflictException({
          message: "A live-pilot payment attempt is already in progress for this report.",
          code: "LIVE_PILOT_ATTEMPT_IN_PROGRESS",
        });
      }

      let created;
      try {
        created = await tx.checkoutIntent.create({
          data: {
            organizationId: input.organizationId,
            actorUserId: input.actor.id,
            purpose: "XRAY_PRO_REPORT",
            status: "CREATED",
            priceId: price.id,
            amountMinor: price.amountMinor,
            currency: price.currency,
            pricingVersionCode: version.code,
            productCode: product.code,
            reportId: input.reportId,
            idempotencyKey: input.idempotencyKey,
            paymentReference: reference,
            provider: this.payments.name,
            checkoutUrl: null,
            customerEmail: input.actor.email,
            customerName: input.actor.name,
            redirectUrl,
            expiresAt,
          },
        });
      } catch (error) {
        // Partial unique index / idempotency key collision under contention.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new ConflictException({
            message: "A live-pilot payment attempt is already in progress for this report.",
            code: "LIVE_PILOT_ATTEMPT_IN_PROGRESS",
          });
        }
        throw error;
      }
      await tx.payment.create({
        data: {
          organizationId: input.organizationId,
          checkoutIntentId: created.id,
          reference,
          provider: this.payments.name,
          status: "PENDING",
          amountMinor: price.amountMinor,
          currency: price.currency,
        },
      });
      return { kind: "reserved" as const, intent: created };
    });

    if (reserved.kind === "replay") {
      return this.livePilotIdempotentReplay(reserved.intent, input.organizationId);
    }

    let initialized;
    try {
      initialized = await this.payments.initializeCheckout({
        reference,
        amountMinor: price.amountMinor,
        currency: price.currency,
        customerEmail: input.actor.email,
        customerName: input.actor.name,
        redirectUrl,
        notificationUrl: this.notificationUrl(),
        narration: `Opero live-pilot probe report ${input.reportId}`,
        metadata: {
          org: input.organizationId.slice(0, 20),
          purpose: "live-pilot",
        },
      });
    } catch (error) {
      await this.handleLivePilotProviderInitFailure(reserved.intent.id, error);
      throw error;
    }

    if (initialized.reference !== reference) {
      // Ambiguous identity — keep reservation; never open a second provider slot.
      throw new PaymentInitError(
        "Provider returned a different payment reference than reserved",
        "ambiguous",
      );
    }

    const intent = await this.prisma.checkoutIntent.update({
      where: { id: reserved.intent.id },
      data: {
        status: "REDIRECTED",
        checkoutUrl: initialized.checkoutUrl,
      },
    });

    await this.audit.record({
      action: "billing.live_pilot_checkout_created",
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
        reportId: input.reportId,
        reference,
        pricingVersion: version.code,
        provider: this.payments.name,
        livePilot: true,
        windowExpiresAt: windowExpiresAt.toISOString(),
      },
    });

    return this.toCheckoutResponse(intent, {
      organizationId: input.organizationId,
      reportId: input.reportId,
    });
  }

  private livePilotIdempotentReplay(
    existing: {
      organizationId: string;
      productCode: string;
      reportId: string | null;
      id: string;
      status: string;
      purpose: string;
      amountMinor: number;
      currency: string;
      checkoutUrl: string | null;
      paymentReference: string;
      expiresAt: Date;
      pricingVersionCode: string;
    },
    organizationId: string,
  ) {
    if (existing.organizationId !== organizationId) {
      throw new ForbiddenException("Idempotency key belongs to another organization");
    }
    if (existing.productCode !== LIVE_PILOT_PRODUCT_CODE) {
      throw new ForbiddenException("Idempotency key is not a live-pilot checkout");
    }
    return this.toCheckoutResponse(existing, {
      organizationId,
      reportId: existing.reportId,
    });
  }

  /** Mark TTL-elapsed active pilot attempts terminal so a new reservation may proceed. */
  private async expireStaleLivePilotAttempts(
    tx: Prisma.TransactionClient,
    organizationId: string,
    reportId: string,
  ) {
    const now = new Date();
    const stale = await tx.checkoutIntent.findMany({
      where: {
        organizationId,
        reportId,
        productCode: LIVE_PILOT_PRODUCT_CODE,
        status: { in: [...LIVE_PILOT_ACTIVE_STATUSES] },
        expiresAt: { lte: now },
        payment: { status: "PENDING" },
      },
      select: { id: true },
    });
    for (const row of stale) {
      await tx.checkoutIntent.update({
        where: { id: row.id },
        data: { status: "EXPIRED" },
      });
      await tx.payment.updateMany({
        where: { checkoutIntentId: row.id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
    }
  }

  /**
   * Definite provider rejection → release reservation (FAILED).
   * Ambiguous / timeout → keep CREATED+PENDING so competitors cannot initiate.
   */
  private async handleLivePilotProviderInitFailure(
    checkoutIntentId: string,
    error: unknown,
  ): Promise<void> {
    if (isAmbiguousPaymentInitError(error)) {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.checkoutIntent.updateMany({
        where: {
          id: checkoutIntentId,
          status: { in: [...LIVE_PILOT_ACTIVE_STATUSES] },
        },
        data: { status: "FAILED" },
      });
      await tx.payment.updateMany({
        where: { checkoutIntentId, status: "PENDING" },
        data: { status: "FAILED", failedAt: new Date() },
      });
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
    this.assertNotLivePilotLocked();
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
    const redirectUrl = this.resolveRedirectUrl(input.redirectUrl);
    const initialized = await this.payments.initializeCheckout({
      reference,
      amountMinor: price.amountMinor,
      currency: price.currency,
      customerEmail: input.actor.email,
      customerName: input.actor.name,
      redirectUrl,
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
          redirectUrl,
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
