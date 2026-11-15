/**
 * PR-1 pilot gates: registration/org caps, invite code, emergency disables, ops token.
 */
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

describe("PR-1 pilot access controls", () => {
  const prisma = testPrisma();

  describe("PUBLIC_REGISTRATION_ENABLED=false", () => {
    let app: INestApplication;

    beforeAll(async () => {
      await resetDatabase();
      ({ app } = await createTestApp({
        envOverrides: {
          PUBLIC_REGISTRATION_ENABLED: false,
          PILOT_MODE: true,
        },
      }));
    });

    afterAll(async () => {
      await cleanupPhase6(app);
      await app.close();
    });

    it("rejects self-serve registration with PUBLIC_REGISTRATION_DISABLED", async () => {
      const blocked = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: `blocked.${randomUUID()}@example.com`,
          name: "Blocked",
          password: "pilot-password-12",
        });
      expect(blocked.status).toBe(403);
      expect(JSON.stringify(blocked.body)).toMatch(/PUBLIC_REGISTRATION_DISABLED|disabled/i);
    });
  });

  describe("invite code, caps, and emergency disables", () => {
    let app: INestApplication;
    let mail: MemoryEmailService;

    beforeAll(async () => {
      await resetDatabase();
      ({ app, mail } = await createTestApp({
        envOverrides: {
          PILOT_INVITE_CODE: "staging-pilot-invite-code",
          PILOT_MAX_USERS: 3,
          PILOT_MAX_ORGANIZATIONS: 1,
          EMERGENCY_DISABLE_CHECKOUT: true,
          EMERGENCY_DISABLE_UPLOADS: true,
          PAYMENT_PROVIDER: "mock",
        },
      }));
    });

    afterAll(async () => {
      await cleanupPhase6(app);
      await app.close();
      await prisma.$disconnect();
    });

    it("requires invite code, enforces caps, and blocks checkout/uploads server-side", async () => {
      const missingCode = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: `nocode.${randomUUID()}@example.com`,
          name: "No Code",
          password: "pilot-password-12",
        });
      expect(missingCode.status).toBe(403);

      const owner = await signUp(app, mail, "cap-owner", {
        inviteCode: "staging-pilot-invite-code",
      });
      const second = await signUp(app, mail, "cap-two", {
        inviteCode: "staging-pilot-invite-code",
      });
      await signUp(app, mail, "cap-three", {
        inviteCode: "staging-pilot-invite-code",
      });

      const overUser = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: `over.${randomUUID()}@example.com`,
          name: "Over Cap",
          password: "pilot-password-12",
          inviteCode: "staging-pilot-invite-code",
        });
      expect(overUser.status).toBe(403);
      expect(JSON.stringify(overUser.body)).toMatch(/PILOT_USER_LIMIT|user limit/i);

      const orgId = await createOrganization(app, owner, "pilot-one");
      const secondOrg = await post(app, second, "/organizations").send({
        name: "Second Org",
        slug: `second-${randomUUID().slice(0, 8)}`,
      });
      expect(secondOrg.status).toBe(403);
      expect(JSON.stringify(secondOrg.body)).toMatch(/PILOT_ORG_LIMIT|organization limit/i);

      const upload = await post(app, owner, `/organizations/${orgId}/documents/uploads`).send({
        filename: "stmt.pdf",
        declaredFormat: "PDF",
      });
      expect(upload.status).toBe(400);
      expect(JSON.stringify(upload.body)).toMatch(
        /EMERGENCY_DISABLE_UPLOADS|uploads are temporarily/i,
      );

      const checkout = await post(
        app,
        owner,
        `/organizations/${orgId}/billing/checkout/xray-pro`,
      ).send({
        reportId: randomUUID(),
        idempotencyKey: randomUUID(),
      });
      expect(checkout.status).toBe(400);
      expect(JSON.stringify(checkout.body)).toMatch(
        /EMERGENCY_DISABLE_CHECKOUT|Checkout is temporarily/i,
      );
    });
  });

  describe("ops status token gate", () => {
    let app: INestApplication;

    beforeAll(async () => {
      await resetDatabase();
      ({ app } = await createTestApp({
        envOverrides: {
          OPS_STATUS_TOKEN: "ops-token-sixteen-chars",
          APP_VERSION: "audit-ops",
        },
      }));
    });

    afterAll(async () => {
      await cleanupPhase6(app);
      await app.close();
    });

    it("rejects missing token and returns a non-secret payload with token", async () => {
      await request(app.getHttpServer()).get("/api/v1/ops/status").expect(401);

      const ok = await request(app.getHttpServer())
        .get("/api/v1/ops/status")
        .set("X-Ops-Token", "ops-token-sixteen-chars")
        .expect(200);
      expect(ok.body.version).toBe("audit-ops");
      expect(["ok", "degraded"]).toContain(ok.body.status);
      expect(ok.body.checks).toBeDefined();
      expect(JSON.stringify(ok.body)).not.toMatch(/CSRF_SECRET|sk_|password|DATABASE_URL/i);
    });
  });
});
