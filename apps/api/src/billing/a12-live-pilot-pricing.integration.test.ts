/**
 * A12-P2: hidden ₦100 live-pilot pricing security acceptance.
 */
import type { INestApplication } from "@nestjs/common";
import { LIVE_PILOT_AMOUNT_MINOR, LIVE_PILOT_PRODUCT_CODE } from "@opero/shared";
import { randomUUID } from "node:crypto";
import request from "supertest";
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

describe("A12-P2 live-pilot pricing controls", () => {
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

  describe("public catalog and kill-switch defaults", () => {
    let app: INestApplication;
    let mail: MemoryEmailService;

    beforeAll(async () => {
      await resetDatabase();
      ({ app, mail } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          LIVE_PILOT_ENABLED: false,
          EMERGENCY_DISABLE_CHECKOUT: false,
        },
      }));
    });

    afterAll(async () => {
      await cleanupPhase6(app);
      await app.close();
      await prisma.$disconnect();
    });

    it("keeps public XRAY_PRO at ₦15,000 and hides the probe product", async () => {
      const catalog = await request(app.getHttpServer()).get("/api/v1/billing/catalog").expect(200);
      const pro = catalog.body.products.find((p: { code: string }) => p.code === "XRAY_PRO");
      expect(pro.prices[0]).toMatchObject({
        currency: "NGN",
        amountMinor: 1_500_000,
      });
      const probe = catalog.body.products.find(
        (p: { code: string }) => p.code === LIVE_PILOT_PRODUCT_CODE,
      );
      expect(probe).toBeUndefined();

      const ctx = await draftReport(app, mail, "cat");
      const disabled = await post(
        app,
        ctx.owner,
        `/organizations/${ctx.organizationId}/billing/checkout/live-pilot`,
      ).send({
        reportId: ctx.reportId,
        idempotencyKey: `lp-off-${randomUUID()}`,
      });
      expect(disabled.status).toBe(400);
      expect(JSON.stringify(disabled.body)).toMatch(/LIVE_PILOT_DISABLED|disabled/i);

      const standard = await post(
        app,
        ctx.owner,
        `/organizations/${ctx.organizationId}/billing/checkout/xray-pro`,
      )
        .send({
          reportId: ctx.reportId,
          idempotencyKey: `std-${randomUUID()}`,
        })
        .expect(201);
      expect(standard.body.checkout.amountMinor).toBe(1_500_000);
    });
  });

  describe("allowlisted ₦100 path with kill-switch precedence", () => {
    let app: INestApplication;
    let mail: MemoryEmailService;
    let organizationId: string;
    let reportId: string;
    let owner: Awaited<ReturnType<typeof signUp>>;
    let outsider: Awaited<ReturnType<typeof signUp>>;
    let otherOrganizationId: string;

    beforeAll(async () => {
      await resetDatabase();
      // Bootstrap fixtures with checkout available, then reconfigure for pilot window.
      ({ app, mail } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          LIVE_PILOT_ENABLED: false,
          EMERGENCY_DISABLE_CHECKOUT: false,
        },
      }));
      const ctx = await draftReport(app, mail, "lp");
      organizationId = ctx.organizationId;
      reportId = ctx.reportId;
      owner = ctx.owner;
      outsider = ctx.outsider;
      otherOrganizationId = ctx.otherOrganizationId;
      await app.close();

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      ({ app, mail } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          LIVE_PILOT_ENABLED: true,
          LIVE_PILOT_EXPIRES_AT: expiresAt,
          LIVE_PILOT_ORG_ID: organizationId,
          LIVE_PILOT_REPORT_ID: reportId,
          LIVE_PILOT_MAX_SUCCESSES: 1,
          EMERGENCY_DISABLE_CHECKOUT: true,
        },
      }));
    });

    afterAll(async () => {
      await cleanupPhase6(app);
      await app.close();
    });

    it("blocks all charges while EMERGENCY_DISABLE_CHECKOUT is true", async () => {
      const killed = await post(
        app,
        owner,
        `/organizations/${organizationId}/billing/checkout/live-pilot`,
      ).send({
        reportId,
        idempotencyKey: `kill-${randomUUID()}`,
      });
      expect(killed.status).toBe(400);
      expect(JSON.stringify(killed.body)).toMatch(/EMERGENCY_DISABLE_CHECKOUT|temporarily disabled/i);

      const publicLocked = await post(
        app,
        owner,
        `/organizations/${organizationId}/billing/checkout/xray-pro`,
      ).send({
        reportId,
        idempotencyKey: `kill-std-${randomUUID()}`,
      });
      expect(publicLocked.status).toBe(400);
    });
  });

  describe("allowlisted success path when kill switch is off", () => {
    let app: INestApplication;
    let mail: MemoryEmailService;
    let organizationId: string;
    let reportId: string;
    let owner: Awaited<ReturnType<typeof signUp>>;
    let outsider: Awaited<ReturnType<typeof signUp>>;
    let otherOrganizationId: string;
    let otherReportId: string;

    beforeAll(async () => {
      await resetDatabase();
      ({ app, mail } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          LIVE_PILOT_ENABLED: false,
          EMERGENCY_DISABLE_CHECKOUT: false,
        },
      }));
      const ctx = await draftReport(app, mail, "ok");
      organizationId = ctx.organizationId;
      reportId = ctx.reportId;
      owner = ctx.owner;
      outsider = ctx.outsider;
      otherOrganizationId = ctx.otherOrganizationId;

      const otherSeeded = await seedDocument({
        organizationId: otherOrganizationId,
        userId: outsider.userId,
        statements: SCORABLE_STATEMENTS,
      });
      const otherDiag = await runDiagnostic(app, outsider, otherOrganizationId, [
        otherSeeded.documentId,
      ]);
      const otherCreated = await post(app, outsider, `/organizations/${otherOrganizationId}/reports`)
        .send({ diagnosticRunId: otherDiag, title: "Other report" })
        .expect(201);
      otherReportId = otherCreated.body.report.id as string;
      const otherPath = `/organizations/${otherOrganizationId}/reports/${otherReportId}`;
      await post(app, outsider, `${otherPath}/submit-review`).send({}).expect(200);
      await post(app, outsider, `${otherPath}/approve`).send({}).expect(200);
      await grantReportGenerateAccess(prisma, otherOrganizationId, otherReportId);
      await post(app, outsider, `${otherPath}/publish`).send({}).expect(200);
      await app.close();

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
      }));
    });

    afterAll(async () => {
      await cleanupPhase6(app);
      await app.close();
      await prisma.$disconnect();
    });

    it("allows only the allowlisted org/report at ₦100 and locks public checkout", async () => {
      const forbiddenOrg = await post(
        app,
        outsider,
        `/organizations/${otherOrganizationId}/billing/checkout/live-pilot`,
      ).send({
        reportId: otherReportId,
        idempotencyKey: `forbid-org-${randomUUID()}`,
      });
      expect(forbiddenOrg.status).toBe(403);
      expect(JSON.stringify(forbiddenOrg.body)).toMatch(/LIVE_PILOT_FORBIDDEN|not authorized/i);

      const wrongReport = await post(
        app,
        owner,
        `/organizations/${organizationId}/billing/checkout/live-pilot`,
      ).send({
        reportId: randomUUID(),
        idempotencyKey: `forbid-report-${randomUUID()}`,
      });
      expect([403, 404]).toContain(wrongReport.status);

      const lockedPublic = await post(
        app,
        owner,
        `/organizations/${organizationId}/billing/checkout/xray-pro`,
      ).send({
        reportId,
        idempotencyKey: `locked-${randomUUID()}`,
      });
      expect(lockedPublic.status).toBe(400);
      expect(JSON.stringify(lockedPublic.body)).toMatch(/LIVE_PILOT_LOCK|locked during/i);

      const idem = `lp-ok-${randomUUID()}`;
      const checkout = await post(
        app,
        owner,
        `/organizations/${organizationId}/billing/checkout/live-pilot`,
      )
        .send({ reportId, idempotencyKey: idem })
        .expect(201);

      expect(checkout.body.checkout.amountMinor).toBe(LIVE_PILOT_AMOUNT_MINOR);
      expect(checkout.body.checkout.currency).toBe("NGN");
      expect(checkout.body.checkout.paymentConfirmed).toBe(false);

      const intent = await prisma.checkoutIntent.findFirst({
        where: { idempotencyKey: idem },
      });
      expect(intent?.productCode).toBe(LIVE_PILOT_PRODUCT_CODE);
      expect(intent?.amountMinor).toBe(LIVE_PILOT_AMOUNT_MINOR);

      const replay = await post(
        app,
        owner,
        `/organizations/${organizationId}/billing/checkout/live-pilot`,
      )
        .send({ reportId, idempotencyKey: idem })
        .expect(201);
      expect(replay.body.checkout.reference).toBe(checkout.body.checkout.reference);

      const secondAttempt = await post(
        app,
        owner,
        `/organizations/${organizationId}/billing/checkout/live-pilot`,
      ).send({
        reportId,
        idempotencyKey: `lp-second-${randomUUID()}`,
      });
      expect(secondAttempt.status).toBe(409);
      expect(JSON.stringify(secondAttempt.body)).toMatch(
        /LIVE_PILOT_ATTEMPT_IN_PROGRESS|already in progress/i,
      );

      const grantsBeforeSettle = await prisma.entitlementGrant.count({
        where: {
          organizationId,
          scopeId: reportId,
          revokedAt: null,
          sourceType: { in: ["PURCHASE", "SUBSCRIPTION"] },
        },
      });
      // Fixture may hold MANUAL xray.report_generate for publish; paid grants stay 0 until settle.
      expect(grantsBeforeSettle).toBe(0);

      const audit = await prisma.auditEvent.findFirst({
        where: { action: "billing.live_pilot_checkout_created", organizationId },
      });
      expect(audit).toBeTruthy();
    });
  });

  describe("expired pilot window", () => {
    let app: INestApplication;
    let mail: MemoryEmailService;
    let organizationId: string;
    let reportId: string;
    let owner: Awaited<ReturnType<typeof signUp>>;

    beforeAll(async () => {
      await resetDatabase();
      ({ app, mail } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          EMERGENCY_DISABLE_CHECKOUT: false,
        },
      }));
      const ctx = await draftReport(app, mail, "exp");
      organizationId = ctx.organizationId;
      reportId = ctx.reportId;
      owner = ctx.owner;
      await app.close();

      ({ app } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          LIVE_PILOT_ENABLED: true,
          LIVE_PILOT_EXPIRES_AT: new Date(Date.now() - 60_000).toISOString(),
          LIVE_PILOT_ORG_ID: organizationId,
          LIVE_PILOT_REPORT_ID: reportId,
          EMERGENCY_DISABLE_CHECKOUT: false,
        },
      }));
    });

    afterAll(async () => {
      await cleanupPhase6(app);
      await app.close();
    });

    it("rejects checkout after LIVE_PILOT_EXPIRES_AT", async () => {
      const expired = await post(
        app,
        owner,
        `/organizations/${organizationId}/billing/checkout/live-pilot`,
      ).send({
        reportId,
        idempotencyKey: `exp-${randomUUID()}`,
      });
      expect(expired.status).toBe(400);
      expect(JSON.stringify(expired.body)).toMatch(/LIVE_PILOT_EXPIRED|expired/i);
    });
  });
});
