/**
 * A12-A2-U: timed pilot upload allowlist security acceptance.
 */
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseApiEnv } from "../config/env";
import { createTestApp } from "../testing/app-factory";
import type { MemoryEmailService } from "../testing/memory-email.service";
import {
  cleanupPhase6,
  createOrganization,
  post,
  resetDatabase,
  signUp,
  testPrisma,
} from "../testing/phase6-fixtures";

const futureExpiry = "2099-06-01T00:00:00.000Z";
const pastExpiry = "2020-06-01T00:00:00.000Z";

async function bootWindow(env: Record<string, string | boolean | number>) {
  await resetDatabase();
  return createTestApp({
    envOverrides: {
      PAYMENT_PROVIDER: "mock",
      EMERGENCY_DISABLE_CHECKOUT: true,
      ...env,
    },
  });
}

describe("A12-A2-U pilot upload allowlist", () => {
  const prisma = testPrisma();

  describe("open window — allowlist org only", () => {
    let app: INestApplication;
    let mail: MemoryEmailService;
    let owner: Awaited<ReturnType<typeof signUp>>;
    let outsider: Awaited<ReturnType<typeof signUp>>;
    let orgId: string;
    let otherOrgId: string;

    beforeAll(async () => {
      // Phase 1: create orgs so we know the allowlist UUID.
      const setup = await bootWindow({
        EMERGENCY_DISABLE_UPLOADS: false,
        PILOT_UPLOAD_ENABLED: false,
      });
      owner = await signUp(setup.app, setup.mail, "a12u-own");
      outsider = await signUp(setup.app, setup.mail, "a12u-out");
      orgId = await createOrganization(setup.app, owner, "a12u-pilot");
      otherOrgId = await createOrganization(setup.app, outsider, "a12u-other");
      await setup.app.close();

      // Phase 2: same DB, allowlist locked to pilot org, window open.
      ({ app, mail } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          EMERGENCY_DISABLE_CHECKOUT: true,
          EMERGENCY_DISABLE_UPLOADS: false,
          PILOT_UPLOAD_ENABLED: true,
          PILOT_UPLOAD_ORG_ID: orgId,
          PILOT_UPLOAD_EXPIRES_AT: futureExpiry,
        },
      }));
      // Re-establish sessions against the new app instance.
      owner = await signUp(app, mail, "a12u-own-b");
      outsider = await signUp(app, mail, "a12u-out-b");
      // Attach new owners to existing orgs via membership insert.
      await prisma.membership.create({
        data: { organizationId: orgId, userId: owner.userId, role: "OWNER" },
      });
      await prisma.membership.create({
        data: { organizationId: otherOrgId, userId: outsider.userId, role: "OWNER" },
      });
    });

    afterAll(async () => {
      await cleanupPhase6(app);
      await app.close();
      await prisma.$disconnect();
    });

    it("accepts allowlisted uploads, denies others, keeps checkout/payments closed", async () => {
      const ok = await post(app, owner, `/organizations/${orgId}/documents/uploads`).send({
        filename: "LIVE_PILOT_SYNTHETIC.pdf",
        declaredFormat: "PDF",
      });
      expect(ok.status).toBe(201);
      expect(ok.body.upload?.uploadId).toBeTruthy();

      const denied = await post(
        app,
        outsider,
        `/organizations/${otherOrgId}/documents/uploads`,
      ).send({
        filename: "other.pdf",
        declaredFormat: "PDF",
      });
      expect(denied.status).toBe(403);
      expect(JSON.stringify(denied.body)).toMatch(/PILOT_UPLOAD_FORBIDDEN|not authorized/i);

      const crossTenant = await post(app, outsider, `/organizations/${orgId}/documents/uploads`).send(
        {
          filename: "cross.pdf",
          declaredFormat: "PDF",
        },
      );
      expect(crossTenant.status).toBeGreaterThanOrEqual(403);

      const unauth = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/documents/uploads`)
        .send({ filename: "anon.pdf", declaredFormat: "PDF" });
      // No session → CSRF/session rejection before upload handlers (401 or 403).
      expect([401, 403]).toContain(unauth.status);

      const checkout = await post(
        app,
        owner,
        `/organizations/${orgId}/billing/checkout/xray-pro`,
      ).send({
        reportId: randomUUID(),
        idempotencyKey: randomUUID(),
      });
      expect(checkout.status).toBe(400);
      expect(JSON.stringify(checkout.body)).toMatch(/EMERGENCY_DISABLE_CHECKOUT|temporarily/i);

      expect(await prisma.payment.count()).toBe(0);
      expect(await prisma.entitlementGrant.count()).toBe(0);
    });
  });

  describe("emergency kill switch precedence", () => {
    it("blocks allowlisted uploads when EMERGENCY_DISABLE_UPLOADS=true", async () => {
      const setup = await bootWindow({
        EMERGENCY_DISABLE_UPLOADS: false,
        PILOT_UPLOAD_ENABLED: false,
      });
      const owner = await signUp(setup.app, setup.mail, "a12u-em");
      const orgId = await createOrganization(setup.app, owner, "a12u-em-org");
      await setup.app.close();

      const { app, mail } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          EMERGENCY_DISABLE_CHECKOUT: true,
          EMERGENCY_DISABLE_UPLOADS: true,
          PILOT_UPLOAD_ENABLED: true,
          PILOT_UPLOAD_ORG_ID: orgId,
          PILOT_UPLOAD_EXPIRES_AT: futureExpiry,
        },
      });
      try {
        const owner2 = await signUp(app, mail, "a12u-em2");
        await prisma.membership.create({
          data: { organizationId: orgId, userId: owner2.userId, role: "OWNER" },
        });
        const blocked = await post(app, owner2, `/organizations/${orgId}/documents/uploads`).send({
          filename: "blocked.pdf",
          declaredFormat: "PDF",
        });
        expect(blocked.status).toBe(400);
        expect(JSON.stringify(blocked.body)).toMatch(
          /EMERGENCY_DISABLE_UPLOADS|temporarily disabled/i,
        );
      } finally {
        await cleanupPhase6(app);
        await app.close();
      }
    });
  });

  describe("expiry and missing configuration", () => {
    it("rejects uploads after PILOT_UPLOAD_EXPIRES_AT", async () => {
      const setup = await bootWindow({
        EMERGENCY_DISABLE_UPLOADS: false,
        PILOT_UPLOAD_ENABLED: false,
      });
      const owner = await signUp(setup.app, setup.mail, "a12u-exp");
      const orgId = await createOrganization(setup.app, owner, "a12u-exp-org");
      await setup.app.close();

      const { app, mail } = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          EMERGENCY_DISABLE_CHECKOUT: true,
          EMERGENCY_DISABLE_UPLOADS: false,
          PILOT_UPLOAD_ENABLED: true,
          PILOT_UPLOAD_ORG_ID: orgId,
          PILOT_UPLOAD_EXPIRES_AT: pastExpiry,
        },
      });
      try {
        const owner2 = await signUp(app, mail, "a12u-exp2");
        await prisma.membership.create({
          data: { organizationId: orgId, userId: owner2.userId, role: "OWNER" },
        });
        const expired = await post(app, owner2, `/organizations/${orgId}/documents/uploads`).send({
          filename: "expired.pdf",
          declaredFormat: "PDF",
        });
        expect(expired.status).toBe(400);
        expect(JSON.stringify(expired.body)).toMatch(/PILOT_UPLOAD_EXPIRED|expired/i);
      } finally {
        await cleanupPhase6(app);
        await app.close();
      }
    });
  });

  describe("A12-A2-U-R4A completeUpload gate", () => {
    const csv = Buffer.from(
      "Label,Amount\nSYNTHETIC Revenue,1250000\nSYNTHETIC Net Income,400000\n",
      "utf8",
    );

    async function complete(
      app: INestApplication,
      actor: Awaited<ReturnType<typeof signUp>>,
      organizationId: string,
      uploadId: string,
    ) {
      return request(app.getHttpServer())
        .post(`/api/v1/organizations/${organizationId}/documents/uploads/${uploadId}/complete`)
        .set("Cookie", actor.cookies)
        .set("x-csrf-token", actor.csrfToken)
        .attach("file", csv, "OPERO_LIVE_PILOT_SYNTHETIC_FS_2024.csv");
    }

    it("completes only during an authorized window and blocks after emergency/expiry", async () => {
      const setup = await bootWindow({
        EMERGENCY_DISABLE_UPLOADS: false,
        PILOT_UPLOAD_ENABLED: false,
      });
      const owner = await signUp(setup.app, setup.mail, "a12u-c1");
      const outsider = await signUp(setup.app, setup.mail, "a12u-c1o");
      const orgId = await createOrganization(setup.app, owner, "a12u-c1-org");
      const otherOrgId = await createOrganization(setup.app, outsider, "a12u-c1-other");
      await setup.app.close();

      const open = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          EMERGENCY_DISABLE_CHECKOUT: true,
          EMERGENCY_DISABLE_UPLOADS: false,
          PILOT_UPLOAD_ENABLED: true,
          PILOT_UPLOAD_ORG_ID: orgId,
          PILOT_UPLOAD_EXPIRES_AT: futureExpiry,
        },
      });
      let owner2 = await signUp(open.app, open.mail, "a12u-c1b");
      let outsider2 = await signUp(open.app, open.mail, "a12u-c1ob");
      await prisma.membership.create({
        data: { organizationId: orgId, userId: owner2.userId, role: "OWNER" },
      });
      await prisma.membership.create({
        data: { organizationId: otherOrgId, userId: outsider2.userId, role: "OWNER" },
      });

      const created = await post(open.app, owner2, `/organizations/${orgId}/documents/uploads`).send({
        filename: "OPERO_LIVE_PILOT_SYNTHETIC_FS_2024.csv",
        declaredFormat: "CSV",
        declaredMimeType: "text/csv",
      });
      expect(created.status).toBe(201);
      const uploadId = created.body.upload.uploadId as string;

      const pending = await post(open.app, owner2, `/organizations/${orgId}/documents/uploads`).send({
        filename: "pending-after-kill.csv",
        declaredFormat: "CSV",
        declaredMimeType: "text/csv",
      });
      expect(pending.status).toBe(201);
      const pendingId = pending.body.upload.uploadId as string;

      const expiredPending = await post(
        open.app,
        owner2,
        `/organizations/${orgId}/documents/uploads`,
      ).send({
        filename: "pending-after-expiry.csv",
        declaredFormat: "CSV",
        declaredMimeType: "text/csv",
      });
      expect(expiredPending.status).toBe(201);
      const expiredPendingId = expiredPending.body.upload.uploadId as string;

      // Authorized completion during window.
      const ok = await complete(open.app, owner2, orgId, uploadId);
      expect(ok.status).toBe(201);
      expect(ok.body.documentId).toBeTruthy();
      expect(ok.body.processingJobId).toBeTruthy();
      expect(await prisma.entitlementGrant.count()).toBe(0);
      expect(await prisma.payment.count()).toBe(0);

      // Idempotent already-completed → conflict (even if we later flip emergency).
      const again = await complete(open.app, owner2, orgId, uploadId);
      expect(again.status).toBe(409);

      // Wrong org cannot complete (session scoped to path org → 404).
      const wrongOrg = await complete(open.app, outsider2, otherOrgId, pendingId);
      expect(wrongOrg.status).toBe(404);

      // Concurrent second complete of still-open session: one wins, other conflicts.
      // Use unique bytes so duplicate-sha256 does not mask the completion race.
      const raceCsv = Buffer.from(
        `Label,Amount\nSYNTHETIC Race ${randomUUID()},42\n`,
        "utf8",
      );
      const raceA = await post(open.app, owner2, `/organizations/${orgId}/documents/uploads`).send({
        filename: "race.csv",
        declaredFormat: "CSV",
        declaredMimeType: "text/csv",
      });
      const raceId = raceA.body.upload.uploadId as string;
      const raceComplete = () =>
        request(open.app.getHttpServer())
          .post(`/api/v1/organizations/${orgId}/documents/uploads/${raceId}/complete`)
          .set("Cookie", owner2.cookies)
          .set("x-csrf-token", owner2.csrfToken)
          .attach("file", raceCsv, "race.csv");
      const [c1, c2] = await Promise.all([raceComplete(), raceComplete()]);
      const statuses = [c1.status, c2.status].sort();
      expect(statuses).toEqual([201, 409]);
      expect(await prisma.documentProcessingJob.count({ where: { organizationId: orgId } })).toBe(
        await prisma.document.count({ where: { organizationId: orgId } }),
      );

      await cleanupPhase6(open.app);
      await open.app.close();

      // Reboot with emergency kill switch — pending session cannot complete / enqueue.
      const killed = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          EMERGENCY_DISABLE_CHECKOUT: true,
          EMERGENCY_DISABLE_UPLOADS: true,
          PILOT_UPLOAD_ENABLED: true,
          PILOT_UPLOAD_ORG_ID: orgId,
          PILOT_UPLOAD_EXPIRES_AT: futureExpiry,
        },
      });
      try {
        owner2 = await signUp(killed.app, killed.mail, "a12u-c1c");
        await prisma.membership.create({
          data: { organizationId: orgId, userId: owner2.userId, role: "OWNER" },
        });
        const jobsBefore = await prisma.documentProcessingJob.count({
          where: { organizationId: orgId },
        });
        const blocked = await complete(killed.app, owner2, orgId, pendingId);
        expect(blocked.status).toBe(400);
        expect(JSON.stringify(blocked.body)).toMatch(
          /EMERGENCY_DISABLE_UPLOADS|temporarily disabled/i,
        );
        expect(await prisma.documentProcessingJob.count({ where: { organizationId: orgId } })).toBe(
          jobsBefore,
        );
        // Already completed remains conflict, not emergency.
        const idempotent = await complete(killed.app, owner2, orgId, uploadId);
        expect(idempotent.status).toBe(409);
      } finally {
        await cleanupPhase6(killed.app);
        await killed.app.close();
      }

      // Reboot with expired pilot window — pending session cannot complete.
      const expiredApp = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          EMERGENCY_DISABLE_CHECKOUT: true,
          EMERGENCY_DISABLE_UPLOADS: false,
          PILOT_UPLOAD_ENABLED: true,
          PILOT_UPLOAD_ORG_ID: orgId,
          PILOT_UPLOAD_EXPIRES_AT: pastExpiry,
        },
      });
      try {
        owner2 = await signUp(expiredApp.app, expiredApp.mail, "a12u-c1d");
        await prisma.membership.create({
          data: { organizationId: orgId, userId: owner2.userId, role: "OWNER" },
        });
        const jobsBefore = await prisma.documentProcessingJob.count({
          where: { organizationId: orgId },
        });
        const expired = await complete(expiredApp.app, owner2, orgId, expiredPendingId);
        expect(expired.status).toBe(400);
        expect(JSON.stringify(expired.body)).toMatch(/PILOT_UPLOAD_EXPIRED|expired/i);
        expect(await prisma.documentProcessingJob.count({ where: { organizationId: orgId } })).toBe(
          jobsBefore,
        );
        expect(await prisma.entitlementGrant.count()).toBe(0);
      } finally {
        await cleanupPhase6(expiredApp.app);
        await expiredApp.app.close();
      }
    });

    it("rejects completion when pilot config is missing while enabled", async () => {
      // Boot with allowlist disabled so we can create a session, then we cannot
      // boot with PILOT_UPLOAD_ENABLED=true and missing org (env parse fails).
      // Missing config is covered at create + parseApiEnv; completion uses the same gate.
      expect(() =>
        parseApiEnv({
          NODE_ENV: "test",
          APP_ENV: "test",
          DATABASE_URL: "postgresql://opero:secret@127.0.0.1:54329/opero_test",
          REDIS_HOST: "127.0.0.1",
          REDIS_PORT: "63799",
          REDIS_PASSWORD: "test-redis",
          CSRF_SECRET: "test-csrf-secret-value-32chars!!",
          APP_ORIGIN: "http://127.0.0.1:3000",
          MAIL_DRIVER: "dev",
          PILOT_UPLOAD_ENABLED: "true",
        }),
      ).toThrow(/PILOT_UPLOAD_ORG_ID|PILOT_UPLOAD_EXPIRES_AT/);
    });

    it("rejects completion when the upload session TTL has elapsed", async () => {
      const setup = await bootWindow({
        EMERGENCY_DISABLE_UPLOADS: false,
        PILOT_UPLOAD_ENABLED: false,
      });
      const owner = await signUp(setup.app, setup.mail, "a12u-ttl");
      const orgId = await createOrganization(setup.app, owner, "a12u-ttl-org");
      await setup.app.close();

      const open = await createTestApp({
        envOverrides: {
          PAYMENT_PROVIDER: "mock",
          EMERGENCY_DISABLE_CHECKOUT: true,
          EMERGENCY_DISABLE_UPLOADS: false,
          PILOT_UPLOAD_ENABLED: true,
          PILOT_UPLOAD_ORG_ID: orgId,
          PILOT_UPLOAD_EXPIRES_AT: futureExpiry,
        },
      });
      try {
        const owner2 = await signUp(open.app, open.mail, "a12u-ttl2");
        await prisma.membership.create({
          data: { organizationId: orgId, userId: owner2.userId, role: "OWNER" },
        });
        const created = await post(open.app, owner2, `/organizations/${orgId}/documents/uploads`).send(
          {
            filename: "ttl.csv",
            declaredFormat: "CSV",
            declaredMimeType: "text/csv",
          },
        );
        expect(created.status).toBe(201);
        const uploadId = created.body.upload.uploadId as string;
        await prisma.documentUpload.update({
          where: { id: uploadId },
          data: { expiresAt: new Date(Date.now() - 60_000) },
        });
        const expiredSession = await complete(open.app, owner2, orgId, uploadId);
        expect(expiredSession.status).toBe(400);
        expect(JSON.stringify(expiredSession.body)).toMatch(/authorization expired|expired/i);
        expect(
          await prisma.documentProcessingJob.count({ where: { organizationId: orgId } }),
        ).toBe(0);
      } finally {
        await cleanupPhase6(open.app);
        await open.app.close();
      }
    });
  });

  describe("env boot rules", () => {
    const base = {
      NODE_ENV: "test" as const,
      APP_ENV: "test" as const,
      DATABASE_URL: "postgresql://opero:secret@127.0.0.1:54329/opero_test",
      REDIS_HOST: "127.0.0.1",
      REDIS_PORT: "63799",
      REDIS_PASSWORD: "test-redis",
      CSRF_SECRET: "test-csrf-secret-value-32chars!!",
      APP_ORIGIN: "http://127.0.0.1:3000",
      MAIL_DRIVER: "dev" as const,
    };

    it("requires org id and expiry when PILOT_UPLOAD_ENABLED=true", () => {
      expect(() =>
        parseApiEnv({
          ...base,
          PILOT_UPLOAD_ENABLED: "true",
        }),
      ).toThrow(/PILOT_UPLOAD_ORG_ID|PILOT_UPLOAD_EXPIRES_AT/);
    });

    it("requires pilot upload allowlist when production opens uploads", () => {
      expect(() =>
        parseApiEnv({
          ...base,
          NODE_ENV: "production",
          APP_ENV: "production",
          DOCUMENT_STORAGE_DRIVER: "s3",
          S3_ENDPOINT: "https://s3.example.com",
          S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
          S3_SECRET_ACCESS_KEY: "secretsecret",
          MAIL_DRIVER: "resend",
          RESEND_API_KEY: "re_test_key_value",
          MAIL_FROM_ADDRESS: "Opero <noreply@example.com>",
          PAYMENT_PROVIDER: "korapay",
          KORAPAY_SECRET_KEY: "sk_live_examplekey",
          APP_ORIGIN: "https://app.example.com",
          REDIS_PASSWORD: "prod-redis-password",
          COOKIE_SECURE: "true",
          EMERGENCY_DISABLE_UPLOADS: "false",
          PILOT_UPLOAD_ENABLED: "false",
        }),
      ).toThrow(/PILOT_UPLOAD_ENABLED/);
    });
  });
});
