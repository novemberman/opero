/**
 * A12-P1: invitation-based pilot onboarding security acceptance.
 */
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, getCookie, mergeCookies } from "../testing/app-factory";
import type { MemoryEmailService } from "../testing/memory-email.service";
import { cleanupPhase6, get, resetDatabase, testPrisma } from "../testing/phase6-fixtures";

const OPS_TOKEN = "ops-token-sixteen-chars";

describe("A12-P1 pilot bootstrap invitations", () => {
  let app: INestApplication;
  let mail: MemoryEmailService;
  const prisma = testPrisma();

  beforeAll(async () => {
    await resetDatabase();
    ({ app, mail } = await createTestApp({
      envOverrides: {
        PUBLIC_REGISTRATION_ENABLED: false,
        PILOT_MODE: true,
        OPS_STATUS_TOKEN: OPS_TOKEN,
        PILOT_BOOTSTRAP_INVITE_TTL_HOURS: 72,
        PAYMENT_PROVIDER: "mock",
      },
    }));
  });

  afterAll(async () => {
    await cleanupPhase6(app);
    await app.close();
    await prisma.$disconnect();
  });

  function issueInvite(body: {
    email: string;
    organizationName: string;
    organizationSlug: string;
    ttlHours?: number;
  }) {
    return request(app.getHttpServer())
      .post("/api/v1/ops/pilot-invitations")
      .set("X-Ops-Token", OPS_TOKEN)
      .send({ ...body, createdByLabel: "a12-p1-test" });
  }

  it("blocks public registration while invite path remains available", async () => {
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

  it("rejects unauthorized invitation creation", async () => {
    const missing = await request(app.getHttpServer())
      .post("/api/v1/ops/pilot-invitations")
      .send({
        email: `noauth.${randomUUID()}@example.com`,
        organizationName: "No Auth Org",
        organizationSlug: `no-auth-${randomUUID().slice(0, 8)}`,
      });
    expect(missing.status).toBe(401);

    const wrong = await request(app.getHttpServer())
      .post("/api/v1/ops/pilot-invitations")
      .set("X-Ops-Token", "definitely-wrong-ops-token")
      .send({
        email: `wrong.${randomUUID()}@example.com`,
        organizationName: "Wrong Org",
        organizationSlug: `wrong-${randomUUID().slice(0, 8)}`,
      });
    expect(wrong.status).toBe(401);
  });

  it("accepts a single-use invite, scopes org ownership, and rejects reuse", async () => {
    const email = `pilot.ok.${randomUUID()}@example.com`;
    const slug = `pilot-ok-${randomUUID().slice(0, 8)}`;
    const created = await issueInvite({
      email,
      organizationName: "Pilot OK Org",
      organizationSlug: slug,
    });
    expect(created.status).toBe(201);
    expect(created.body.invitation.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(mail.messages.some((m) => m.to === email)).toBe(true);

    const stored = await prisma.pilotBootstrapInvitation.findUnique({
      where: { id: created.body.invitation.id },
    });
    expect(stored?.tokenHash).toBeTruthy();
    expect(stored?.tokenHash).not.toBe(created.body.invitation.token);

    const weak = await request(app.getHttpServer())
      .post("/api/v1/auth/pilot-invitations/accept")
      .send({
        token: created.body.invitation.token,
        name: "Pilot Owner",
        password: "short",
      });
    expect(weak.status).toBe(400);

    const accepted = await request(app.getHttpServer())
      .post("/api/v1/auth/pilot-invitations/accept")
      .send({
        token: created.body.invitation.token,
        name: "Pilot Owner",
        password: "pilot-password-12",
      })
      .expect(201);

    expect(accepted.body.user.email).toBe(email);
    expect(accepted.body.organization.slug).toBe(slug);

    const membership = await prisma.membership.findFirst({
      where: {
        userId: accepted.body.user.id,
        organizationId: accepted.body.organization.id,
      },
    });
    expect(membership?.role).toBe("OWNER");

    const user = await prisma.user.findUnique({ where: { id: accepted.body.user.id } });
    expect(user?.emailVerifiedAt).toBeTruthy();

    const reuse = await request(app.getHttpServer())
      .post("/api/v1/auth/pilot-invitations/accept")
      .send({
        token: created.body.invitation.token,
        name: "Reuse Attempt",
        password: "pilot-password-12",
      });
    expect(reuse.status).toBe(400);
    expect(JSON.stringify(reuse.body)).toMatch(/PILOT_INVITE_INVALID|Invalid or expired/i);

    const audit = await prisma.auditEvent.findMany({
      where: {
        OR: [
          { action: "pilot.invite_created" },
          { action: "pilot.invite_accepted" },
          { action: "org.created", organizationId: accepted.body.organization.id },
        ],
      },
    });
    expect(audit.some((e) => e.action === "pilot.invite_accepted")).toBe(true);
    expect(audit.some((e) => e.action === "org.created")).toBe(true);
  });

  it("rejects expired and revoked invitations", async () => {
    const expiredEmail = `pilot.exp.${randomUUID()}@example.com`;
    const expired = await issueInvite({
      email: expiredEmail,
      organizationName: "Expired Org",
      organizationSlug: `exp-${randomUUID().slice(0, 8)}`,
      ttlHours: 1,
    });
    expect(expired.status).toBe(201);

    await prisma.pilotBootstrapInvitation.update({
      where: { id: expired.body.invitation.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const expiredAccept = await request(app.getHttpServer())
      .post("/api/v1/auth/pilot-invitations/accept")
      .send({
        token: expired.body.invitation.token,
        name: "Expired",
        password: "pilot-password-12",
      });
    expect(expiredAccept.status).toBe(400);

    const revokeEmail = `pilot.rev.${randomUUID()}@example.com`;
    const revocable = await issueInvite({
      email: revokeEmail,
      organizationName: "Revoked Org",
      organizationSlug: `rev-${randomUUID().slice(0, 8)}`,
    });
    expect(revocable.status).toBe(201);

    await request(app.getHttpServer())
      .post(`/api/v1/ops/pilot-invitations/${revocable.body.invitation.id}/revoke`)
      .set("X-Ops-Token", OPS_TOKEN)
      .expect(204);

    const revokedAccept = await request(app.getHttpServer())
      .post("/api/v1/auth/pilot-invitations/accept")
      .send({
        token: revocable.body.invitation.token,
        name: "Revoked",
        password: "pilot-password-12",
      });
    expect(revokedAccept.status).toBe(400);

    const bogus = await request(app.getHttpServer())
      .post("/api/v1/auth/pilot-invitations/accept")
      .send({
        token: "a".repeat(64),
        name: "Bogus",
        password: "pilot-password-12",
      });
    expect(bogus.status).toBe(400);
  });

  it("keeps tenant isolation after invite-based onboarding", async () => {
    const aEmail = `tenant.a.${randomUUID()}@example.com`;
    const bEmail = `tenant.b.${randomUUID()}@example.com`;
    const aInvite = await issueInvite({
      email: aEmail,
      organizationName: "Tenant A",
      organizationSlug: `ten-a-${randomUUID().slice(0, 8)}`,
    });
    expect(aInvite.status).toBe(201);
    const bInvite = await issueInvite({
      email: bEmail,
      organizationName: "Tenant B",
      organizationSlug: `ten-b-${randomUUID().slice(0, 8)}`,
    });
    expect(bInvite.status).toBe(201);

    const aAccept = await request(app.getHttpServer())
      .post("/api/v1/auth/pilot-invitations/accept")
      .send({
        token: aInvite.body.invitation.token,
        name: "Tenant A Owner",
        password: "pilot-password-12",
      })
      .expect(201);
    const bAccept = await request(app.getHttpServer())
      .post("/api/v1/auth/pilot-invitations/accept")
      .send({
        token: bInvite.body.invitation.token,
        name: "Tenant B Owner",
        password: "pilot-password-12",
      })
      .expect(201);

    async function login(email: string) {
      const loginRes = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: "pilot-password-12" })
        .expect(200);
      const session = getCookie(
        loginRes.headers["set-cookie"],
        process.env.SESSION_COOKIE_NAME ?? "opero_session",
      )!;
      const csrfRes = await request(app.getHttpServer())
        .get("/api/v1/auth/csrf")
        .set("Cookie", session)
        .expect(200);
      return {
        session,
        cookies: mergeCookies(
          session,
          getCookie(csrfRes.headers["set-cookie"], process.env.CSRF_COOKIE_NAME ?? "opero_csrf"),
        ),
        csrfToken: csrfRes.body.csrfToken as string,
        userId: loginRes.body.user.id as string,
      };
    }

    const a = await login(aEmail);
    const b = await login(bEmail);
    const orgA = aAccept.body.organization.id as string;
    const orgB = bAccept.body.organization.id as string;

    await get(app, a, `/organizations/${orgA}`).expect(200);
    await get(app, b, `/organizations/${orgB}`).expect(200);
    const crossA = await get(app, a, `/organizations/${orgB}`);
    const crossB = await get(app, b, `/organizations/${orgA}`);
    // Deny without leaking membership details (403 or 404 both acceptable).
    expect([403, 404]).toContain(crossA.status);
    expect([403, 404]).toContain(crossB.status);
  });
});

describe("A12-P1 public registration remains the only blocked bootstrap path", () => {
  let app: INestApplication;

  beforeAll(async () => {
    await resetDatabase();
    ({ app } = await createTestApp({
      envOverrides: {
        PUBLIC_REGISTRATION_ENABLED: false,
        PILOT_MODE: true,
        OPS_STATUS_TOKEN: OPS_TOKEN,
      },
    }));
  });

  afterAll(async () => {
    await cleanupPhase6(app);
    await app.close();
  });

  it("does not allow ordinary sign-up even when another user already exists via invite", async () => {
    const email = `solo.${randomUUID()}@example.com`;
    const created = await request(app.getHttpServer())
      .post("/api/v1/ops/pilot-invitations")
      .set("X-Ops-Token", OPS_TOKEN)
      .send({
        email,
        organizationName: "Solo Org",
        organizationSlug: `solo-${randomUUID().slice(0, 8)}`,
        createdByLabel: "test",
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/v1/auth/pilot-invitations/accept")
      .send({
        token: created.body.invitation.token,
        name: "Solo",
        password: "pilot-password-12",
      })
      .expect(201);

    const blocked = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: `another.${randomUUID()}@example.com`,
        name: "Another",
        password: "pilot-password-12",
      });
    expect(blocked.status).toBe(403);
  });
});
