/**
 * A12-P3-R2: concurrent live-pilot payment initiation hardening.
 */
import type { INestApplication } from "@nestjs/common";
import {
  MockKorapayProvider,
  PaymentInitError,
  type InitializeCheckoutInput,
  type InitializeCheckoutResult,
} from "@opero/payments";
import { LIVE_PILOT_AMOUNT_MINOR, LIVE_PILOT_PRODUCT_CODE } from "@opero/shared";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../testing/app-factory";
import type { MemoryEmailService } from "../testing/memory-email.service";
import {
  SCORABLE_STATEMENTS,
  cleanupPhase6,
  createOrganization,
  post,
  resetDatabase,
  runDiagnostic,
  seedDocument,
  signUp,
  testPrisma,
  grantReportGenerateAccess,
} from "../testing/phase6-fixtures";

class InstrumentedMockProvider extends MockKorapayProvider {
  initCalls = 0;
  delayMs = 0;
  nextError: PaymentInitError | null = null;
  private gate: Promise<void> | null = null;
  private releaseGate: (() => void) | null = null;

  holdNextInit(): void {
    this.gate = new Promise<void>((resolve) => {
      this.releaseGate = resolve;
    });
  }

  releaseHeldInit(): void {
    this.releaseGate?.();
    this.releaseGate = null;
    this.gate = null;
  }

  override async initializeCheckout(
    input: InitializeCheckoutInput,
  ): Promise<InitializeCheckoutResult> {
    this.initCalls += 1;
    if (this.gate) await this.gate;
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      throw err;
    }
    return super.initializeCheckout(input);
  }
}

describe("A12-P3-R2 live-pilot concurrency hardening", () => {
  const prisma = testPrisma();

  async function draftReport(
    app: INestApplication,
    mail: MemoryEmailService,
    label: string,
  ) {
    const owner = await signUp(app, mail, `${label}-own`);
    const outsider = await signUp(app, mail, `${label}-out`);
    const organizationId = await createOrganization(app, owner, label);
    const otherOrganizationId = await createOrganization(app, outsider, `${label}-other`);
    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: SCORABLE_STATEMENTS,
    });
    const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);
    const created = await post(app, owner, `/organizations/${organizationId}/reports`)
      .send({ diagnosticRunId, title: `Pilot ${label}` })
      .expect(201);
    const reportId = created.body.report.id as string;
    const path = `/organizations/${organizationId}/reports/${reportId}`;
    await post(app, owner, `${path}/submit-review`).send({}).expect(200);
    await post(app, owner, `${path}/approve`).send({}).expect(200);
    await grantReportGenerateAccess(prisma, organizationId, reportId);
    await post(app, owner, `${path}/publish`).send({}).expect(200);
    return { owner, outsider, organizationId, otherOrganizationId, reportId };
  }

  describe("concurrent provider initiation", () => {
    let app: INestApplication;
    let mail: MemoryEmailService;
    let organizationId: string;
    let reportId: string;
    let owner: Awaited<ReturnType<typeof signUp>>;
    let outsider: Awaited<ReturnType<typeof signUp>>;
    let otherOrganizationId: string;
    let provider: InstrumentedMockProvider;

    beforeAll(async () => {
      await resetDatabase();
      provider = new InstrumentedMockProvider();
      ({ app, mail } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          LIVE_PILOT_ENABLED: false,
          EMERGENCY_DISABLE_CHECKOUT: false,
        },
        paymentProvider: provider,
      }));
      const ctx = await draftReport(app, mail, "r2c");
      organizationId = ctx.organizationId;
      reportId = ctx.reportId;
      owner = ctx.owner;
      outsider = ctx.outsider;
      otherOrganizationId = ctx.otherOrganizationId;
      await app.close();

      provider = new InstrumentedMockProvider();
      provider.delayMs = 75;
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      ({ app } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          LIVE_PILOT_ENABLED: true,
          LIVE_PILOT_EXPIRES_AT: expiresAt,
          LIVE_PILOT_ORG_ID: organizationId,
          LIVE_PILOT_REPORT_ID: reportId,
          LIVE_PILOT_MAX_SUCCESSES: 1,
          EMERGENCY_DISABLE_CHECKOUT: false,
        },
        paymentProvider: provider,
      }));
    });

    afterAll(async () => {
      await cleanupPhase6(app);
      await app.close();
      await prisma.$disconnect();
    });

    it("allows at most one provider initiation across two simultaneous requests", async () => {
      provider.initCalls = 0;
      const results = await Promise.all([
        post(app, owner, `/organizations/${organizationId}/billing/checkout/live-pilot`).send({
          reportId,
          idempotencyKey: `r2-two-a-${randomUUID()}`,
        }),
        post(app, owner, `/organizations/${organizationId}/billing/checkout/live-pilot`).send({
          reportId,
          idempotencyKey: `r2-two-b-${randomUUID()}`,
        }),
      ]);

      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409]);
      expect(provider.initCalls).toBe(1);
      expect(
        results.some((r) =>
          /LIVE_PILOT_ATTEMPT_IN_PROGRESS|already in progress/i.test(JSON.stringify(r.body)),
        ),
      ).toBe(true);

      const intents = await prisma.checkoutIntent.count({
        where: {
          organizationId,
          reportId,
          productCode: LIVE_PILOT_PRODUCT_CODE,
          status: { in: ["CREATED", "REDIRECTED", "PENDING_PAYMENT"] },
        },
      });
      expect(intents).toBe(1);
    });

    it("allows at most one provider initiation across ten simultaneous requests", async () => {
      // Clear the active attempt from the previous test by marking it terminal.
      await prisma.payment.updateMany({
        where: {
          organizationId,
          status: "PENDING",
          checkoutIntent: { productCode: LIVE_PILOT_PRODUCT_CODE, reportId },
        },
        data: { status: "FAILED", failedAt: new Date() },
      });
      await prisma.checkoutIntent.updateMany({
        where: {
          organizationId,
          reportId,
          productCode: LIVE_PILOT_PRODUCT_CODE,
          status: { in: ["CREATED", "REDIRECTED", "PENDING_PAYMENT"] },
        },
        data: { status: "FAILED" },
      });

      provider.initCalls = 0;
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          post(app, owner, `/organizations/${organizationId}/billing/checkout/live-pilot`).send({
            reportId,
            idempotencyKey: `r2-ten-${i}-${randomUUID()}`,
          }),
        ),
      );

      const wins = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);
      expect(wins).toHaveLength(1);
      expect(conflicts).toHaveLength(9);
      expect(provider.initCalls).toBe(1);
      expect(wins[0]?.body.checkout.amountMinor).toBe(LIVE_PILOT_AMOUNT_MINOR);
    });

    it("keeps idempotent same-key retries safe under concurrency", async () => {
      await prisma.payment.updateMany({
        where: {
          organizationId,
          status: "PENDING",
          checkoutIntent: { productCode: LIVE_PILOT_PRODUCT_CODE, reportId },
        },
        data: { status: "FAILED", failedAt: new Date() },
      });
      await prisma.checkoutIntent.updateMany({
        where: {
          organizationId,
          reportId,
          productCode: LIVE_PILOT_PRODUCT_CODE,
          status: { in: ["CREATED", "REDIRECTED", "PENDING_PAYMENT"] },
        },
        data: { status: "FAILED" },
      });

      provider.initCalls = 0;
      const idem = `r2-idem-${randomUUID()}`;
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          post(app, owner, `/organizations/${organizationId}/billing/checkout/live-pilot`).send({
            reportId,
            idempotencyKey: idem,
          }),
        ),
      );

      expect(results.every((r) => r.status === 201)).toBe(true);
      const refs = new Set(results.map((r) => r.body.checkout.reference));
      expect(refs.size).toBe(1);
      expect(provider.initCalls).toBe(1);
    });

    it("denies cross-tenant live-pilot initiation", async () => {
      const denied = await post(
        app,
        outsider,
        `/organizations/${otherOrganizationId}/billing/checkout/live-pilot`,
      ).send({
        reportId,
        idempotencyKey: `r2-xtenant-${randomUUID()}`,
      });
      expect([403, 404]).toContain(denied.status);
    });

    it("grants no entitlement before verified settlement", async () => {
      const grants = await prisma.entitlementGrant.count({
        where: { organizationId, scopeId: reportId, revokedAt: null },
      });
      expect(grants).toBe(0);
    });
  });

  describe("provider failure and ambiguous timeout reservation policy", () => {
    let app: INestApplication;
    let mail: MemoryEmailService;
    let organizationId: string;
    let reportId: string;
    let owner: Awaited<ReturnType<typeof signUp>>;
    let provider: InstrumentedMockProvider;

    beforeAll(async () => {
      await resetDatabase();
      provider = new InstrumentedMockProvider();
      ({ app, mail } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          LIVE_PILOT_ENABLED: false,
          EMERGENCY_DISABLE_CHECKOUT: false,
        },
        paymentProvider: provider,
      }));
      const ctx = await draftReport(app, mail, "r2f");
      organizationId = ctx.organizationId;
      reportId = ctx.reportId;
      owner = ctx.owner;
      await app.close();

      provider = new InstrumentedMockProvider();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      ({ app } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          LIVE_PILOT_ENABLED: true,
          LIVE_PILOT_EXPIRES_AT: expiresAt,
          LIVE_PILOT_ORG_ID: organizationId,
          LIVE_PILOT_REPORT_ID: reportId,
          LIVE_PILOT_MAX_SUCCESSES: 1,
          EMERGENCY_DISABLE_CHECKOUT: false,
        },
        paymentProvider: provider,
      }));
    });

    afterAll(async () => {
      await cleanupPhase6(app);
      await app.close();
    });

    it("releases reservation on definite provider failure so a later attempt can proceed", async () => {
      provider.nextError = new PaymentInitError(
        "Korapay checkout initialization failed",
        "definite",
      );
      const failed = await post(
        app,
        owner,
        `/organizations/${organizationId}/billing/checkout/live-pilot`,
      ).send({
        reportId,
        idempotencyKey: `r2-def-${randomUUID()}`,
      });
      expect(failed.status).toBeGreaterThanOrEqual(400);

      const active = await prisma.checkoutIntent.count({
        where: {
          organizationId,
          reportId,
          productCode: LIVE_PILOT_PRODUCT_CODE,
          status: { in: ["CREATED", "REDIRECTED", "PENDING_PAYMENT"] },
        },
      });
      expect(active).toBe(0);

      provider.initCalls = 0;
      const retry = await post(
        app,
        owner,
        `/organizations/${organizationId}/billing/checkout/live-pilot`,
      )
        .send({
          reportId,
          idempotencyKey: `r2-def-retry-${randomUUID()}`,
        })
        .expect(201);
      expect(provider.initCalls).toBe(1);
      expect(retry.body.checkout.amountMinor).toBe(LIVE_PILOT_AMOUNT_MINOR);
    });

    it("does not release reservation on ambiguous provider timeout (blocks duplicate initiation)", async () => {
      await prisma.payment.updateMany({
        where: {
          organizationId,
          status: "PENDING",
          checkoutIntent: { productCode: LIVE_PILOT_PRODUCT_CODE, reportId },
        },
        data: { status: "FAILED", failedAt: new Date() },
      });
      await prisma.checkoutIntent.updateMany({
        where: {
          organizationId,
          reportId,
          productCode: LIVE_PILOT_PRODUCT_CODE,
          status: { in: ["CREATED", "REDIRECTED", "PENDING_PAYMENT"] },
        },
        data: { status: "FAILED" },
      });

      provider.nextError = new PaymentInitError("fetch failed: upstream timeout", "ambiguous");
      const timedOut = await post(
        app,
        owner,
        `/organizations/${organizationId}/billing/checkout/live-pilot`,
      ).send({
        reportId,
        idempotencyKey: `r2-amb-${randomUUID()}`,
      });
      expect(timedOut.status).toBeGreaterThanOrEqual(400);

      const held = await prisma.checkoutIntent.findFirst({
        where: {
          organizationId,
          reportId,
          productCode: LIVE_PILOT_PRODUCT_CODE,
          status: "CREATED",
          payment: { status: "PENDING" },
        },
      });
      expect(held).toBeTruthy();

      provider.initCalls = 0;
      const competing = await post(
        app,
        owner,
        `/organizations/${organizationId}/billing/checkout/live-pilot`,
      ).send({
        reportId,
        idempotencyKey: `r2-amb-comp-${randomUUID()}`,
      });
      expect(competing.status).toBe(409);
      expect(provider.initCalls).toBe(0);
      expect(JSON.stringify(competing.body)).toMatch(
        /LIVE_PILOT_ATTEMPT_IN_PROGRESS|already in progress/i,
      );
    });
  });

  describe("kill-switch and LIVE_PILOT_ENABLED gates", () => {
    let app: INestApplication;
    let mail: MemoryEmailService;
    let organizationId: string;
    let reportId: string;
    let owner: Awaited<ReturnType<typeof signUp>>;
    let provider: InstrumentedMockProvider;

    beforeAll(async () => {
      await resetDatabase();
      provider = new InstrumentedMockProvider();
      ({ app, mail } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          LIVE_PILOT_ENABLED: false,
          EMERGENCY_DISABLE_CHECKOUT: false,
        },
        paymentProvider: provider,
      }));
      const ctx = await draftReport(app, mail, "r2g");
      organizationId = ctx.organizationId;
      reportId = ctx.reportId;
      owner = ctx.owner;
      await app.close();
    });

    afterAll(async () => {
      if (app) {
        await cleanupPhase6(app);
        await app.close();
      }
    });

    it("gives EMERGENCY_DISABLE_CHECKOUT precedence and never calls the provider", async () => {
      provider = new InstrumentedMockProvider();
      ({ app } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          LIVE_PILOT_ENABLED: true,
          LIVE_PILOT_EXPIRES_AT: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          LIVE_PILOT_ORG_ID: organizationId,
          LIVE_PILOT_REPORT_ID: reportId,
          EMERGENCY_DISABLE_CHECKOUT: true,
        },
        paymentProvider: provider,
      }));

      const killed = await post(
        app,
        owner,
        `/organizations/${organizationId}/billing/checkout/live-pilot`,
      ).send({
        reportId,
        idempotencyKey: `r2-kill-${randomUUID()}`,
      });
      expect(killed.status).toBe(400);
      expect(JSON.stringify(killed.body)).toMatch(/EMERGENCY_DISABLE_CHECKOUT|temporarily disabled/i);
      expect(provider.initCalls).toBe(0);
      await app.close();
    });

    it("blocks initiation when LIVE_PILOT_ENABLED=false without calling the provider", async () => {
      provider = new InstrumentedMockProvider();
      ({ app } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          LIVE_PILOT_ENABLED: false,
          EMERGENCY_DISABLE_CHECKOUT: false,
        },
        paymentProvider: provider,
      }));

      const disabled = await post(
        app,
        owner,
        `/organizations/${organizationId}/billing/checkout/live-pilot`,
      ).send({
        reportId,
        idempotencyKey: `r2-off-${randomUUID()}`,
      });
      expect(disabled.status).toBe(400);
      expect(JSON.stringify(disabled.body)).toMatch(/LIVE_PILOT_DISABLED|disabled/i);
      expect(provider.initCalls).toBe(0);
    });
  });
});
