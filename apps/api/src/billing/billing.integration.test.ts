/**
 * Phase 7A: mock Korapay checkout → verify → entitlement, plus security
 * controls for forged success, webhooks, amount/currency mismatch, and tenants.
 */
import type { INestApplication } from "@nestjs/common";
import { MockKorapayProvider } from "@opero/payments";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../testing/app-factory";
import type { MemoryEmailService } from "../testing/memory-email.service";
import {
  SCORABLE_STATEMENTS,
  addMember,
  cleanupPhase6,
  createOrganization,
  get,
  post,
  resetDatabase,
  runDiagnostic,
  seedDocument,
  signUp,
  testPrisma,
} from "../testing/phase6-fixtures";
import { PAYMENT_PROVIDER } from "./payment.tokens";

describe("Phase 7A billing (mock Korapay)", () => {
  let app: INestApplication;
  let mail: MemoryEmailService;
  let payments: MockKorapayProvider;
  const prisma = testPrisma();

  beforeAll(async () => {
    await resetDatabase();
    ({ app, mail } = await createTestApp({
      envOverrides: {
        PAYMENT_PROVIDER: "mock",
        KORAPAY_SECRET_KEY: "test_korapay_secret_key_do_not_use_live",
      },
    }));
    payments = app.get(PAYMENT_PROVIDER) as MockKorapayProvider;
  });

  afterAll(async () => {
    await cleanupPhase6(app);
    await app.close();
    await prisma.$disconnect();
  });

  async function draftReport(label: string) {
    const owner = await signUp(app, mail, `${label}-own`);
    const viewer = await signUp(app, mail, `${label}-view`);
    const outsider = await signUp(app, mail, `${label}-out`);
    const organizationId = await createOrganization(app, owner, label);
    await addMember(organizationId, viewer.userId, "VIEWER");
    const otherOrganizationId = await createOrganization(app, outsider, `${label}-other`);
    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: SCORABLE_STATEMENTS,
    });
    const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);
    const created = await post(app, owner, `/organizations/${organizationId}/reports`)
      .send({ diagnosticRunId, title: `Bill ${label}` })
      .expect(201);
    const reportId = created.body.report.id as string;
    const path = `/organizations/${organizationId}/reports/${reportId}`;
    await post(app, owner, `${path}/submit-review`).send({}).expect(200);
    await post(app, owner, `${path}/approve`).send({}).expect(200);
    await post(app, owner, `${path}/publish`).send({}).expect(200);
    return { owner, viewer, outsider, organizationId, otherOrganizationId, reportId, path };
  }

  it("exposes the launch catalog in NGN minor units", async () => {
    const catalog = await request(app.getHttpServer()).get("/api/v1/billing/catalog").expect(200);
    const pro = catalog.body.products.find((p: { code: string }) => p.code === "XRAY_PRO");
    expect(pro.prices[0]).toMatchObject({
      currency: "NGN",
      amountMinor: 1_500_000,
      interval: "ONE_TIME",
    });
    const starter = catalog.body.products.find((p: { code: string }) => p.code === "OS_STARTER");
    expect(starter.prices[0].amountMinor).toBe(2_500_000);
    const growth = catalog.body.products.find((p: { code: string }) => p.code === "OS_GROWTH");
    expect(growth.prices[0].amountMinor).toBe(6_500_000);
  });

  it("completes mock X-Ray Pro checkout exactly once and unlocks PDF", async () => {
    const ctx = await draftReport("pro-happy");
    await get(app, ctx.viewer, `${ctx.path}/pdf`).expect(403);
    const locked = await get(app, ctx.viewer, ctx.path).expect(200);
    expect(locked.body.access).toBe("FREE_PREVIEW");
    expect(locked.body.preview.upgradeRequired).toBe(true);

    const denied = await post(app, ctx.viewer, `/organizations/${ctx.organizationId}/billing/checkout/xray-pro`)
      .send({ reportId: ctx.reportId, idempotencyKey: `deny-${randomUUID()}` })
      .expect(403);
    expect(denied.body.message).toMatch(/permission|Insufficient/i);

    const idem = `idem-${randomUUID()}`;
    const checkout = await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/checkout/xray-pro`,
    )
      .send({
        reportId: ctx.reportId,
        idempotencyKey: idem,
        redirectUrl: "http://127.0.0.1:3000/billing/return",
      })
      .expect(201);
    expect(checkout.body.checkout.paymentConfirmed).toBe(false);
    expect(checkout.body.checkout.amountMinor).toBe(1_500_000);
    expect(checkout.body.checkout.currency).toBe("NGN");
    const reference = checkout.body.checkout.reference as string;

    const again = await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/checkout/xray-pro`,
    )
      .send({ reportId: ctx.reportId, idempotencyKey: idem })
      .expect(201);
    expect(again.body.checkout.reference).toBe(reference);

    // Client-claimed success without provider settlement must not unlock.
    const forged = await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/payments/verify`,
    )
      .send({ reference })
      .expect(200);
    expect(forged.body.providerStatus).toBe("pending");
    expect(forged.body.fulfillment.status).toBe("FAILED");
    await get(app, ctx.viewer, `${ctx.path}/pdf`).expect(403);

    payments.settle(reference, "success");
    const verified = await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/payments/verify`,
    )
      .send({ reference })
      .expect(200);
    expect(verified.body.fulfillment.status).toBe("FULFILLED");

    const replay = await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/payments/verify`,
    )
      .send({ reference })
      .expect(200);
    expect(replay.body.fulfillment.status).toBe("ALREADY_FULFILLED");

    const grants = await prisma.entitlementGrant.findMany({
      where: { organizationId: ctx.organizationId, scopeId: ctx.reportId },
    });
    expect(grants.map((g) => g.code).sort()).toEqual([
      "xray.full_report",
      "xray.pdf_download",
    ]);
    expect(grants).toHaveLength(2);

    await get(app, ctx.viewer, `${ctx.path}/pdf`).expect(200);
    const unlocked = await get(app, ctx.viewer, ctx.path).expect(200);
    expect(unlocked.body.access).toBe("FULL");

    // Cross-tenant cannot verify or download.
    await post(
      app,
      ctx.outsider,
      `/organizations/${ctx.otherOrganizationId}/billing/payments/verify`,
    )
      .send({ reference })
      .expect(404);
    await get(app, ctx.outsider, `${ctx.path}/pdf`).expect(404);
  });

  it("rejects invalid webhook signatures and dedupes replays", async () => {
    const ctx = await draftReport("hook");
    const checkout = await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/checkout/xray-pro`,
    )
      .send({ reportId: ctx.reportId, idempotencyKey: `hook-${randomUUID()}` })
      .expect(201);
    const reference = checkout.body.checkout.reference as string;
    payments.settle(reference, "success");

    const forged = await request(app.getHttpServer())
      .post("/api/v1/billing/webhooks/korapay")
      .set("x-korapay-signature", "forged")
      .send({
        event: "charge.success",
        data: { reference, amount: 15000, currency: "NGN", status: "success" },
      })
      .expect(200);
    expect(forged.body.valid).toBe(false);
    await get(app, ctx.viewer, `${ctx.path}/pdf`).expect(403);

    const signed = payments.signWebhook({
      event: "charge.success",
      data: { reference, amount: 15000, currency: "NGN", status: "success" },
    });
    await request(app.getHttpServer())
      .post("/api/v1/billing/webhooks/korapay")
      .set(signed.headers)
      .send(signed.body)
      .expect(200);
    await get(app, ctx.viewer, `${ctx.path}/pdf`).expect(200);

    const replay = await request(app.getHttpServer())
      .post("/api/v1/billing/webhooks/korapay")
      .set(signed.headers)
      .send(signed.body)
      .expect(200);
    expect(replay.body.duplicate).toBe(true);
    expect(
      await prisma.entitlementGrant.count({
        where: { organizationId: ctx.organizationId, scopeId: ctx.reportId },
      }),
    ).toBe(2);
  });

  it("rejects amount and currency mismatches after provider verify", async () => {
    const ctx = await draftReport("mismatch");
    const checkout = await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/checkout/xray-pro`,
    )
      .send({ reportId: ctx.reportId, idempotencyKey: `mm-${randomUUID()}` })
      .expect(201);
    const reference = checkout.body.checkout.reference as string;
    // Tamper stored charge amount before settle/verify.
    await prisma.payment.update({
      where: { reference },
      data: { amountMinor: 999 },
    });
    payments.settle(reference, "success");
    const response = await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/payments/verify`,
    )
      .send({ reference })
      .expect(409);
    expect(response.body.code).toBe("AMOUNT_MISMATCH");
    await get(app, ctx.viewer, `${ctx.path}/pdf`).expect(403);
  });

  it("revokes entitlements on refund webhook and supports subscription cancel", async () => {
    const ctx = await draftReport("refund");
    const checkout = await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/checkout/xray-pro`,
    )
      .send({ reportId: ctx.reportId, idempotencyKey: `rf-${randomUUID()}` })
      .expect(201);
    const reference = checkout.body.checkout.reference as string;
    payments.settle(reference, "success");
    await post(app, ctx.owner, `/organizations/${ctx.organizationId}/billing/payments/verify`)
      .send({ reference })
      .expect(200);
    await get(app, ctx.viewer, `${ctx.path}/pdf`).expect(200);

    // Official Korapay refund shape: reference = refund id, payment_reference = charge.
    const refund = payments.signWebhook({
      event: "refund.success",
      data: {
        reference: `RFD-${randomUUID().slice(0, 8)}`,
        payment_reference: reference,
        amount: 15000,
        currency: "NGN",
        status: "success",
      },
    });
    await request(app.getHttpServer())
      .post("/api/v1/billing/webhooks/korapay")
      .set(refund.headers)
      .send(refund.body)
      .expect(200);
    await get(app, ctx.viewer, `${ctx.path}/pdf`).expect(403);

    const subCheckout = await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/checkout/subscription`,
    )
      .send({
        planCode: "OS_STARTER",
        purpose: "SUBSCRIPTION_START",
        idempotencyKey: `sub-${randomUUID()}`,
      })
      .expect(201);
    const subRef = subCheckout.body.checkout.reference as string;
    payments.settle(subRef, "success");
    await post(app, ctx.owner, `/organizations/${ctx.organizationId}/billing/payments/verify`)
      .send({ reference: subRef })
      .expect(200);
    const subs = await get(app, ctx.owner, `/organizations/${ctx.organizationId}/billing/subscriptions`).expect(
      200,
    );
    const subscriptionId = subs.body.subscriptions[0].id as string;
    await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/subscriptions/${subscriptionId}/cancel`,
    )
      .send({})
      .expect(200);
    const canceled = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(canceled.cancelAtPeriodEnd).toBe(true);
  });

  it("does not double-fulfill under concurrent verification", async () => {
    const ctx = await draftReport("race");
    const checkout = await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/checkout/xray-pro`,
    )
      .send({ reportId: ctx.reportId, idempotencyKey: `race-${randomUUID()}` })
      .expect(201);
    const reference = checkout.body.checkout.reference as string;
    payments.settle(reference, "success");

    const results = await Promise.all(
      [0, 1, 2].map(() =>
        post(app, ctx.owner, `/organizations/${ctx.organizationId}/billing/payments/verify`).send({
          reference,
        }),
      ),
    );
    for (const res of results) {
      expect([200, 409]).toContain(res.status);
      if (res.status === 200) {
        expect(["FULFILLED", "ALREADY_FULFILLED"]).toContain(res.body.fulfillment.status);
      } else {
        expect(res.body.code).toBe("FULFILLMENT_IN_PROGRESS");
      }
    }
    // Settle any in-progress race: final verify must be idempotent.
    const final = await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/payments/verify`,
    )
      .send({ reference })
      .expect(200);
    expect(["FULFILLED", "ALREADY_FULFILLED"]).toContain(final.body.fulfillment.status);
    expect(
      await prisma.entitlementGrant.count({
        where: { organizationId: ctx.organizationId, scopeId: ctx.reportId, revokedAt: null },
      }),
    ).toBe(2);
  });

  it("expires subscription benefits while retaining one-time report purchases", async () => {
    const ctx = await draftReport("expire");
    const reportCheckout = await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/checkout/xray-pro`,
    )
      .send({ reportId: ctx.reportId, idempotencyKey: `exp-pro-${randomUUID()}` })
      .expect(201);
    const reportRef = reportCheckout.body.checkout.reference as string;
    payments.settle(reportRef, "success");
    await post(app, ctx.owner, `/organizations/${ctx.organizationId}/billing/payments/verify`)
      .send({ reference: reportRef })
      .expect(200);

    const subCheckout = await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/checkout/subscription`,
    )
      .send({
        planCode: "OS_GROWTH",
        purpose: "SUBSCRIPTION_START",
        idempotencyKey: `exp-sub-${randomUUID()}`,
      })
      .expect(201);
    const subRef = subCheckout.body.checkout.reference as string;
    payments.settle(subRef, "success");
    await post(app, ctx.owner, `/organizations/${ctx.organizationId}/billing/payments/verify`)
      .send({ reference: subRef })
      .expect(200);

    const subs = await get(app, ctx.owner, `/organizations/${ctx.organizationId}/billing/subscriptions`).expect(
      200,
    );
    const subscriptionId = subs.body.subscriptions[0].id as string;

    const due = await get(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/subscriptions/renewals-due`,
    ).expect(200);
    expect(due.body.autoDebit).toBe(false);

    await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/subscriptions/${subscriptionId}/remind`,
    )
      .send({})
      .expect(200);

    // Force period end + grace past so refresh expires the subscription.
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        currentPeriodEnd: past,
        graceUntil: new Date(past.getTime() + 24 * 60 * 60 * 1000),
        status: "ACTIVE",
      },
    });

    const { SubscriptionsService } = await import("./subscriptions.service");
    const subscriptions = app.get(SubscriptionsService);
    await subscriptions.refreshStatus(ctx.organizationId, subscriptionId, new Date());

    const subGrants = await prisma.entitlementGrant.findMany({
      where: {
        organizationId: ctx.organizationId,
        sourceType: "SUBSCRIPTION",
        sourceId: subscriptionId,
      },
    });
    expect(subGrants.length).toBeGreaterThan(0);
    expect(subGrants.every((g) => g.revokedAt != null)).toBe(true);

    const purchaseGrants = await prisma.entitlementGrant.findMany({
      where: {
        organizationId: ctx.organizationId,
        scopeId: ctx.reportId,
        sourceType: "PURCHASE",
        revokedAt: null,
      },
    });
    expect(purchaseGrants.map((g) => g.code).sort()).toEqual([
      "xray.full_report",
      "xray.pdf_download",
    ]);
    await get(app, ctx.viewer, `${ctx.path}/pdf`).expect(200);
  });

  it("marks charge.failed without granting entitlements", async () => {
    const ctx = await draftReport("failhook");
    const checkout = await post(
      app,
      ctx.owner,
      `/organizations/${ctx.organizationId}/billing/checkout/xray-pro`,
    )
      .send({ reportId: ctx.reportId, idempotencyKey: `fail-${randomUUID()}` })
      .expect(201);
    const reference = checkout.body.checkout.reference as string;
    payments.settle(reference, "failed");

    const signed = payments.signWebhook({
      event: "charge.failed",
      data: { reference, amount: 15000, currency: "NGN", status: "failed" },
    });
    await request(app.getHttpServer())
      .post("/api/v1/billing/webhooks/korapay")
      .set(signed.headers)
      .send(signed.body)
      .expect(200);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { reference } });
    expect(payment.status).toBe("FAILED");
    await get(app, ctx.viewer, `${ctx.path}/pdf`).expect(403);
  });

  it("records enterprise quotation requests without exposing secrets", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/billing/enterprise-quotes")
      .send({
        contactName: "Ada",
        contactEmail: "ada@example.com",
        companyName: "Example Ltd",
        message: "Need Enterprise for 200 seats",
      })
      .expect(201);
    expect(response.body.quote.status).toBe("RECEIVED");
    expect(JSON.stringify(response.body)).not.toMatch(/sk_|secret/i);
  });
});
