/**
 * M12-G final: restricted synthetic entitlement issue/revoke security acceptance.
 * Isolated local/rehearsal only — no production mutations.
 */
import type { INestApplication } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../testing/app-factory";
import type { MemoryEmailService } from "../testing/memory-email.service";
import {
  cleanupPhase6,
  createOrganization,
  get,
  post,
  resetDatabase,
  runDiagnostic,
  SCORABLE_STATEMENTS,
  seedDocument,
  signUp,
  testPrisma,
  type TestSession,
} from "../testing/phase6-fixtures";

const OPS_TOKEN = "ops-token-sixteen-chars";
const CONFIRM_TOKEN = "synthetic-confirm-16c";

function download(app: INestApplication, actor: TestSession, path: string) {
  return get(app, actor, path)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    });
}

describe("M12-G synthetic entitlement infrastructure", () => {
  const prisma = testPrisma();

  describe("disabled by default", () => {
    let app: INestApplication;
    let mail: MemoryEmailService;
    let organizationId: string;
    let reportId: string;

    beforeAll(async () => {
      await resetDatabase();
      ({ app, mail } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          OPS_STATUS_TOKEN: OPS_TOKEN,
          SYNTHETIC_ENTITLEMENT_ENABLED: false,
          SYNTHETIC_ENTITLEMENT_CONFIRMATION_TOKEN: CONFIRM_TOKEN,
          SYNTHETIC_ENTITLEMENT_ORG_IDS: "11111111-1111-4111-8111-111111111111",
        },
      }));
      const owner = await signUp(app, mail, "off-own");
      organizationId = await createOrganization(app, owner, "off");
      const seeded = await seedDocument({
        organizationId,
        userId: owner.userId,
        statements: SCORABLE_STATEMENTS,
      });
      const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);
      const created = await post(app, owner, `/organizations/${organizationId}/reports`)
        .send({ diagnosticRunId, title: "Off" })
        .expect(201);
      reportId = created.body.report.id as string;
    });

    afterAll(async () => {
      await cleanupPhase6(app);
      await app.close();
      await prisma.$disconnect();
    });

    it("rejects issuance for both codes while the feature flag is off", async () => {
      for (const code of ["xray.report_generate", "xray.pdf_download"] as const) {
        const denied = await request(app.getHttpServer())
          .post("/api/v1/ops/synthetic-entitlements")
          .set("X-Ops-Token", OPS_TOKEN)
          .set("X-Synthetic-Entitlement-Confirmation", CONFIRM_TOKEN)
          .send({
            organizationId,
            reportId,
            code,
            acceptanceReference: "M12-G",
            reason: "should-be-disabled",
            createdByLabel: "m12g",
          });
        expect(denied.status).toBe(403);
        expect(denied.body.code).toBe("SYNTHETIC_ENTITLEMENT_DISABLED");
      }
    });
  });

  describe("enabled rehearsal path", () => {
    let app: INestApplication;
    let mail: MemoryEmailService;
    let owner: TestSession;
    let outsider: TestSession;
    let organizationId: string;
    let otherOrganizationId: string;
    let reportId: string;
    let path: string;
    let contentHash: string;

    beforeAll(async () => {
      await resetDatabase();
      ({ app, mail } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          OPS_STATUS_TOKEN: OPS_TOKEN,
          SYNTHETIC_ENTITLEMENT_ENABLED: false,
        },
      }));
      owner = await signUp(app, mail, "on-own");
      outsider = await signUp(app, mail, "on-out");
      organizationId = await createOrganization(app, owner, "on");
      otherOrganizationId = await createOrganization(app, outsider, "on-other");
      const seeded = await seedDocument({
        organizationId,
        userId: owner.userId,
        statements: SCORABLE_STATEMENTS,
      });
      const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);
      const created = await post(app, owner, `/organizations/${organizationId}/reports`)
        .send({ diagnosticRunId, title: "Synthetic publish" })
        .expect(201);
      reportId = created.body.report.id as string;
      path = `/organizations/${organizationId}/reports/${reportId}`;
      await post(app, owner, `${path}/submit-review`).send({}).expect(200);
      await post(app, owner, `${path}/approve`).send({}).expect(200);
      await app.close();

      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      ({ app, mail } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          OPS_STATUS_TOKEN: OPS_TOKEN,
          SYNTHETIC_ENTITLEMENT_ENABLED: true,
          SYNTHETIC_ENTITLEMENT_ORG_IDS: organizationId,
          SYNTHETIC_ENTITLEMENT_EXPIRES_AT: expiresAt,
          SYNTHETIC_ENTITLEMENT_DEFAULT_TTL_HOURS: 2,
          SYNTHETIC_ENTITLEMENT_CONFIRMATION_TOKEN: CONFIRM_TOKEN,
        },
      }));
    });

    afterAll(async () => {
      await cleanupPhase6(app);
      await app.close();
      await prisma.$disconnect();
    });

    function issue(body: Record<string, unknown>, headers?: Record<string, string>) {
      const req = request(app.getHttpServer()).post("/api/v1/ops/synthetic-entitlements");
      if (headers) {
        for (const [k, v] of Object.entries(headers)) req.set(k, v);
      } else {
        req.set("X-Ops-Token", OPS_TOKEN).set("X-Synthetic-Entitlement-Confirmation", CONFIRM_TOKEN);
      }
      return req.send(body);
    }

    function revoke(body: Record<string, unknown>, headers?: Record<string, string>) {
      const req = request(app.getHttpServer()).post("/api/v1/ops/synthetic-entitlements/revoke");
      if (headers) {
        for (const [k, v] of Object.entries(headers)) req.set(k, v);
      } else {
        req.set("X-Ops-Token", OPS_TOKEN).set("X-Synthetic-Entitlement-Confirmation", CONFIRM_TOKEN);
      }
      return req.send(body);
    }

    it("denies unprivileged operators and OWNER self-issuance", async () => {
      const noAuth = await issue(
        {
          organizationId,
          reportId,
          code: "xray.report_generate",
          acceptanceReference: "M12-G",
          reason: "missing-tokens",
        },
        {},
      );
      expect(noAuth.status).toBe(401);

      const opsOnly = await issue(
        {
          organizationId,
          reportId,
          code: "xray.report_generate",
          acceptanceReference: "M12-G",
          reason: "missing-confirmation",
        },
        { "X-Ops-Token": OPS_TOKEN },
      );
      expect(opsOnly.status).toBe(401);
      expect(opsOnly.body.code).toBe("SYNTHETIC_CONFIRMATION_UNAUTHORIZED");

      const ownerAttempt = await post(app, owner, "/ops/synthetic-entitlements").send({
        organizationId,
        reportId,
        code: "xray.report_generate",
        acceptanceReference: "M12-G",
        reason: "owner-self-issue",
      });
      expect(ownerAttempt.status).toBe(401);
    });

    it("denies non-allowlisted organizations", async () => {
      const denied = await issue({
        organizationId: otherOrganizationId,
        reportId,
        code: "xray.report_generate",
        acceptanceReference: "M12-G",
        reason: "cross-tenant-attempt",
        createdByLabel: "m12g",
      });
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe("SYNTHETIC_ENTITLEMENT_ORG_FORBIDDEN");
    });

    it("issues report_generate, publishes, keeps PDF download denied until pdf_download grant", async () => {
      const paymentsBefore = await prisma.payment.count();

      const issued = await issue({
        organizationId,
        reportId,
        code: "xray.report_generate",
        acceptanceReference: "M12-G-FINAL",
        reason: "isolated-rehearsal-publish-path",
        createdByLabel: "m12g-rehearsal",
        ttlHours: 1,
      });
      expect(issued.status).toBe(201);
      expect(issued.body.grant.code).toBe("xray.report_generate");
      expect(issued.body.idempotent).toBe(false);

      const published = await post(app, owner, `${path}/publish`).send({}).expect(200);
      expect(published.body.report.status).toBe("PUBLISHED");
      const version = published.body.report.versions[0] as {
        storageKey: string;
        contentHash: string;
        byteSize: number;
      };
      expect(version.storageKey).toMatch(
        new RegExp(`^org/${organizationId}/reports/${reportId}/.+\.pdf$`),
      );
      contentHash = version.contentHash;

      const pdfDenied = await get(app, owner, `${path}/pdf`);
      expect(pdfDenied.status).toBe(403);
      expect(pdfDenied.body.code).toBe("ENTITLEMENT_REQUIRED");

      const downloadGrant = await issue({
        organizationId,
        reportId,
        code: "xray.pdf_download",
        acceptanceReference: "M12-G-FINAL",
        reason: "isolated-rehearsal-pdf-download",
        createdByLabel: "m12g-rehearsal",
        ttlHours: 1,
      });
      expect(downloadGrant.status).toBe(201);
      expect(downloadGrant.body.grant.code).toBe("xray.pdf_download");

      const pdf = await download(app, owner, `${path}/pdf`).expect(200);
      expect(pdf.headers["content-type"]).toBe("application/pdf");
      const pdfBody = pdf.body as Buffer;
      expect(pdfBody.subarray(0, 5).toString()).toBe("%PDF-");
      expect(createHash("sha256").update(pdfBody).digest("hex")).toBe(contentHash);

      await request(app.getHttpServer()).get(`/api/v1${path}/pdf`).expect(401);
      await get(app, outsider, `${path}/pdf`).expect(404);

      expect(await prisma.payment.count()).toBe(paymentsBefore);
      expect(
        await prisma.entitlementGrant.count({
          where: { sourceType: { in: ["PURCHASE", "SUBSCRIPTION"] } },
        }),
      ).toBe(0);
      expect(
        await prisma.entitlementGrant.count({
          where: {
            organizationId,
            scopeId: reportId,
            code: { in: ["xray.report_generate", "xray.pdf_download"] },
            revokedAt: null,
          },
        }),
      ).toBe(2);
    });

    it("revokes pdf_download then report_generate independently", async () => {
      const revokedDownload = await revoke({
        organizationId,
        reportId,
        code: "xray.pdf_download",
        reason: "revoke-download-only",
        createdByLabel: "m12g-rehearsal",
      });
      expect(revokedDownload.status).toBe(200);
      expect(revokedDownload.body.grant.code).toBe("xray.pdf_download");
      expect(revokedDownload.body.grant.revokedAt).toBeTypeOf("string");

      const pdfDeniedAgain = await get(app, owner, `${path}/pdf`);
      expect(pdfDeniedAgain.status).toBe(403);
      expect(pdfDeniedAgain.body.code).toBe("ENTITLEMENT_REQUIRED");

      const stillPublished = await prisma.xRayReport.findUniqueOrThrow({ where: { id: reportId } });
      expect(stillPublished.status).toBe("PUBLISHED");

      const revokedGenerate = await revoke({
        organizationId,
        reportId,
        code: "xray.report_generate",
        reason: "revoke-generate",
        createdByLabel: "m12g-rehearsal",
      });
      expect(revokedGenerate.status).toBe(200);
      expect(revokedGenerate.body.grant.code).toBe("xray.report_generate");

      expect(
        await prisma.entitlementGrant.count({
          where: { organizationId, scopeId: reportId, revokedAt: null },
        }),
      ).toBe(0);
      expect(await prisma.payment.count()).toBe(0);
    });
  });

  describe("issuance shutdown still allows revocation", () => {
    let enabledApp: INestApplication;
    let disabledApp: INestApplication;
    let organizationId: string;
    let reportId: string;

    beforeAll(async () => {
      await resetDatabase();
      let mail: MemoryEmailService;
      ({ app: enabledApp, mail } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          OPS_STATUS_TOKEN: OPS_TOKEN,
          SYNTHETIC_ENTITLEMENT_ENABLED: false,
        },
      }));
      const owner = await signUp(enabledApp, mail, "shut-own");
      organizationId = await createOrganization(enabledApp, owner, "shut");
      const seeded = await seedDocument({
        organizationId,
        userId: owner.userId,
        statements: SCORABLE_STATEMENTS,
      });
      const diagnosticRunId = await runDiagnostic(enabledApp, owner, organizationId, [
        seeded.documentId,
      ]);
      const created = await post(enabledApp, owner, `/organizations/${organizationId}/reports`)
        .send({ diagnosticRunId, title: "Shutdown" })
        .expect(201);
      reportId = created.body.report.id as string;
      await enabledApp.close();

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      ({ app: enabledApp } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          OPS_STATUS_TOKEN: OPS_TOKEN,
          SYNTHETIC_ENTITLEMENT_ENABLED: true,
          SYNTHETIC_ENTITLEMENT_ORG_IDS: organizationId,
          SYNTHETIC_ENTITLEMENT_EXPIRES_AT: expiresAt,
          SYNTHETIC_ENTITLEMENT_CONFIRMATION_TOKEN: CONFIRM_TOKEN,
        },
      }));

      await request(enabledApp.getHttpServer())
        .post("/api/v1/ops/synthetic-entitlements")
        .set("X-Ops-Token", OPS_TOKEN)
        .set("X-Synthetic-Entitlement-Confirmation", CONFIRM_TOKEN)
        .send({
          organizationId,
          reportId,
          code: "xray.report_generate",
          acceptanceReference: "M12-G-SHUTDOWN",
          reason: "grant-before-disable",
          createdByLabel: "m12g",
        })
        .expect(201);
      await enabledApp.close();

      ({ app: disabledApp } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          OPS_STATUS_TOKEN: OPS_TOKEN,
          SYNTHETIC_ENTITLEMENT_ENABLED: false,
          SYNTHETIC_ENTITLEMENT_ORG_IDS: organizationId,
          SYNTHETIC_ENTITLEMENT_CONFIRMATION_TOKEN: CONFIRM_TOKEN,
        },
      }));
    });

    afterAll(async () => {
      await cleanupPhase6(disabledApp);
      await disabledApp.close();
      await prisma.$disconnect();
    });

    it("blocks new issuance but still revokes with dual secrets while flag is off", async () => {
      const issueDenied = await request(disabledApp.getHttpServer())
        .post("/api/v1/ops/synthetic-entitlements")
        .set("X-Ops-Token", OPS_TOKEN)
        .set("X-Synthetic-Entitlement-Confirmation", CONFIRM_TOKEN)
        .send({
          organizationId,
          reportId,
          code: "xray.pdf_download",
          acceptanceReference: "M12-G",
          reason: "after-disable-issue",
          createdByLabel: "m12g",
        });
      expect(issueDenied.status).toBe(403);
      expect(issueDenied.body.code).toBe("SYNTHETIC_ENTITLEMENT_DISABLED");

      const revoked = await request(disabledApp.getHttpServer())
        .post("/api/v1/ops/synthetic-entitlements/revoke")
        .set("X-Ops-Token", OPS_TOKEN)
        .set("X-Synthetic-Entitlement-Confirmation", CONFIRM_TOKEN)
        .send({
          organizationId,
          reportId,
          code: "xray.report_generate",
          reason: "emergency-revoke-while-disabled",
          createdByLabel: "m12g",
        });
      expect(revoked.status).toBe(200);
      expect(revoked.body.grant.revokedAt).toBeTypeOf("string");
      expect(revoked.body.policy.revocationDuringIssuanceShutdown).toMatch(/Revoke remains/);
    });
  });

  describe("feature flag precedence after disable", () => {
    let app: INestApplication;

    beforeAll(async () => {
      await resetDatabase();
      ({ app } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          OPS_STATUS_TOKEN: OPS_TOKEN,
          SYNTHETIC_ENTITLEMENT_ENABLED: false,
          SYNTHETIC_ENTITLEMENT_CONFIRMATION_TOKEN: CONFIRM_TOKEN,
          SYNTHETIC_ENTITLEMENT_ORG_IDS: "00000000-0000-4000-8000-000000000001",
        },
      }));
    });

    afterAll(async () => {
      await cleanupPhase6(app);
      await app.close();
      await prisma.$disconnect();
    });

    it("blocks issuance again after the mechanism is disabled", async () => {
      const denied = await request(app.getHttpServer())
        .post("/api/v1/ops/synthetic-entitlements")
        .set("X-Ops-Token", OPS_TOKEN)
        .set("X-Synthetic-Entitlement-Confirmation", CONFIRM_TOKEN)
        .send({
          organizationId: "00000000-0000-4000-8000-000000000001",
          reportId: randomUUID(),
          code: "xray.report_generate",
          acceptanceReference: "M12-G",
          reason: "after-disable",
          createdByLabel: "m12g",
        });
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe("SYNTHETIC_ENTITLEMENT_DISABLED");
    });
  });
});
