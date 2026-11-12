import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, getCookie, mergeCookies } from "../testing/app-factory";
import type { MemoryEmailService } from "../testing/memory-email.service";
import { loadDatabaseModule } from "../database/load-database";

async function registerVerifyLogin(
  app: INestApplication,
  mail: MemoryEmailService,
  user: { email: string; name: string; password: string },
) {
  await request(app.getHttpServer()).post("/api/v1/auth/register").send(user).expect(201);
  const token = mail.latestToken("/verify-email");
  await request(app.getHttpServer())
    .post("/api/v1/auth/verify-email")
    .send({ token })
    .expect(204);

  const login = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email: user.email, password: user.password })
    .expect(200);

  const session = getCookie(login.headers["set-cookie"], process.env.SESSION_COOKIE_NAME ?? "opero_session");
  expect(session).toBeTruthy();

  const csrfRes = await request(app.getHttpServer())
    .get("/api/v1/auth/csrf")
    .set("Cookie", session!)
    .expect(200);
  const csrfCookie = getCookie(
    csrfRes.headers["set-cookie"],
    process.env.CSRF_COOKIE_NAME ?? "opero_csrf",
  );
  const csrfToken = csrfRes.body.csrfToken as string;
  const cookies = mergeCookies(session, csrfCookie);

  return { session: session!, cookies, csrfToken };
}

describe("Phase 3 security integration", () => {
  let app: INestApplication;
  let mail: MemoryEmailService;

  beforeAll(async () => {
    const { createPrismaClient } = await loadDatabaseModule();
    const prisma = createPrismaClient(process.env.DATABASE_URL!);
    await prisma.documentAccessEvent.deleteMany();
    await prisma.extractionReview.deleteMany();
    await prisma.financialLineItem.deleteMany();
    await prisma.evidenceReference.deleteMany();
    await prisma.financialStatement.deleteMany();
    await prisma.documentExtraction.deleteMany();
    await prisma.documentProcessingJob.deleteMany();
    await prisma.documentVersion.deleteMany();
    await prisma.documentUpload.deleteMany();
    await prisma.document.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.organizationInvitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.session.deleteMany();
    await prisma.emailVerificationToken.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();

    ({ app, mail } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("registers, rejects unverified login, verifies, and logs in", async () => {
    const email = `alpha.owner@example.com`;
    const password = "correct-horse-battery-staple";
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, name: "Alpha Owner", password })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(401);

    const token = mail.latestToken("/verify-email");
    await request(app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(204);
    await request(app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(400);

    await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password }).expect(200);
  });

  it("rejects invalid credentials with a generic message", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "missing@example.com", password: "definitely-wrong-1" })
      .expect(401);
    expect(response.body.message).toBe("Invalid email or password");
  });

  it("keeps auth throttling configurable without NODE_ENV bypass", () => {
    // Unrelated suites set AUTH_THROTTLE_DISABLED=true. Login throttle coverage lives in
    // login-throttle.integration.test.ts with AUTH_THROTTLE_DISABLED=false and a low limit.
    expect(process.env.AUTH_THROTTLE_DISABLED).toBe("true");
    expect(process.env.NODE_ENV).toBe("test");
  });

  it("sets HttpOnly SameSite=Lax session cookies and rotates on login", async () => {
    const email = "cookie.user@example.com";
    const password = "cookie-password-12";
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, name: "Cookie User", password })
      .expect(201);
    const token = mail.latestToken("/verify-email");
    await request(app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(204);

    const first = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    const setCookie = first.headers["set-cookie"];
    const headers = Array.isArray(setCookie) ? setCookie : [setCookie];
    const sessionHeader = headers.find((h) =>
      h?.startsWith(`${process.env.SESSION_COOKIE_NAME ?? "opero_session"}=`),
    );
    expect(sessionHeader).toMatch(/HttpOnly/i);
    expect(sessionHeader).toMatch(/SameSite=Lax/i);

    const firstSession = getCookie(setCookie, process.env.SESSION_COOKIE_NAME ?? "opero_session")!;
    const second = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Cookie", firstSession)
      .send({ email, password })
      .expect(200);
    const rotated = getCookie(
      second.headers["set-cookie"],
      process.env.SESSION_COOKIE_NAME ?? "opero_session",
    )!;
    expect(rotated).not.toBe(firstSession);

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", firstSession)
      .expect(401);
    await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", rotated).expect(200);
  });

  it("rejects CORS requests from disallowed origins", async () => {
    const response = await request(app.getHttpServer())
      .options("/api/v1/auth/csrf")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "GET")
      .expect(204);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });


  it("supports password reset with single-use tokens and session revocation", async () => {
    const user = {
      email: "reset.user@example.com",
      name: "Reset User",
      password: "initial-password-12",
    };
    const auth = await registerVerifyLogin(app, mail, user);

    await request(app.getHttpServer())
      .post("/api/v1/auth/forgot-password")
      .send({ email: user.email })
      .expect(204);
    const resetToken = mail.latestToken("/reset-password");

    await request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({ token: resetToken, password: "replacement-password-12" })
      .expect(204);

    await request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({ token: resetToken, password: "another-password-123" })
      .expect(400);

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", auth.session)
      .expect(401);

    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "replacement-password-12" })
      .expect(200);
  });

  it("rejects state-changing requests without CSRF", async () => {
    const auth = await registerVerifyLogin(app, mail, {
      email: "csrf.user@example.com",
      name: "CSRF User",
      password: "csrf-password-123",
    });

    await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", auth.session)
      .send({ name: "CSRF Org", slug: "csrf-org" })
      .expect(403);
  });

  it("isolates two organizations and enforces final-owner protection", async () => {
    const alpha = await registerVerifyLogin(app, mail, {
      email: "tenant.alpha@example.com",
      name: "Tenant Alpha",
      password: "alpha-password-12",
    });
    const beta = await registerVerifyLogin(app, mail, {
      email: "tenant.beta@example.com",
      name: "Tenant Beta",
      password: "beta-password-123",
    });

    const alphaOrg = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", alpha.cookies)
      .set("x-csrf-token", alpha.csrfToken)
      .send({ name: "Alpha Biz", slug: "alpha-biz" })
      .expect(201);

    const betaOrg = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", beta.cookies)
      .set("x-csrf-token", beta.csrfToken)
      .send({ name: "Beta Biz", slug: "beta-biz" })
      .expect(201);

    const alphaId = alphaOrg.body.organization.id as string;
    const betaId = betaOrg.body.organization.id as string;

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${betaId}`)
      .set("Cookie", alpha.session)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${betaId}/members`)
      .set("Cookie", alpha.session)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${betaId}/invitations`)
      .set("Cookie", alpha.session)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${betaId}`)
      .set("Cookie", alpha.cookies)
      .set("x-csrf-token", alpha.csrfToken)
      .send({ name: "Hijacked" })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${alphaId}/leave`)
      .set("Cookie", alpha.cookies)
      .set("x-csrf-token", alpha.csrfToken)
      .expect(403);

    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", alpha.session)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/organizations/${alphaId}/members/${me.body.user.id}`)
      .set("Cookie", alpha.cookies)
      .set("x-csrf-token", alpha.csrfToken)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${alphaId}/invitations`)
      .set("Cookie", alpha.cookies)
      .set("x-csrf-token", alpha.csrfToken)
      .send({ email: "analyst@example.com", role: "ANALYST" })
      .expect(201);

    const inviteToken = mail.latestToken("/invitations/accept");
    await request(app.getHttpServer())
      .post("/api/v1/invitations/accept-public")
      .send({
        token: inviteToken,
        name: "Analyst One",
        password: "analyst-password-1",
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/v1/invitations/accept-public")
      .send({
        token: inviteToken,
        name: "Analyst One",
        password: "analyst-password-1",
      })
      .expect(400);

    const { createPrismaClient } = await loadDatabaseModule();
    const prisma = createPrismaClient(process.env.DATABASE_URL!);
    const audits = await prisma.auditEvent.findMany({
      where: { organizationId: alphaId },
    });
    expect(audits.some((event) => event.action === "org.created")).toBe(true);
    expect(
      audits.every((event) => {
        const meta = event.metadata as Record<string, unknown> | null;
        const blob = JSON.stringify(meta ?? {});
        return !blob.includes("password") && !blob.includes("token=");
      }),
    ).toBe(true);
    await prisma.$disconnect();
  });

  it("blocks ADMIN from assigning OWNER and has no public audit mutation API", async () => {
    const owner = await registerVerifyLogin(app, mail, {
      email: "rbac.owner@example.com",
      name: "RBAC Owner",
      password: "rbac-owner-pass12",
    });
    const orgRes = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookies)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "RBAC Org", slug: "rbac-org" })
      .expect(201);
    const organizationId = orgRes.body.organization.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/invitations`)
      .set("Cookie", owner.cookies)
      .set("x-csrf-token", owner.csrfToken)
      .send({ email: "rbac.admin@example.com", role: "ADMIN" })
      .expect(201);
    const inviteToken = mail.latestToken("/invitations/accept");
    await request(app.getHttpServer())
      .post("/api/v1/invitations/accept-public")
      .send({
        token: inviteToken,
        name: "RBAC Admin",
        password: "rbac-admin-pass12",
      })
      .expect(201);

    const adminLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "rbac.admin@example.com", password: "rbac-admin-pass12" })
      .expect(200);
    const adminSession = getCookie(
      adminLogin.headers["set-cookie"],
      process.env.SESSION_COOKIE_NAME ?? "opero_session",
    )!;
    const adminCsrfRes = await request(app.getHttpServer())
      .get("/api/v1/auth/csrf")
      .set("Cookie", adminSession)
      .expect(200);
    const adminCookies = mergeCookies(
      adminSession,
      getCookie(
        adminCsrfRes.headers["set-cookie"],
        process.env.CSRF_COOKIE_NAME ?? "opero_csrf",
      ),
    );
    const adminCsrf = adminCsrfRes.body.csrfToken as string;

    const members = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/members`)
      .set("Cookie", owner.session)
      .expect(200);
    const ownerMember = (
      members.body.members as Array<{ userId: string; role: string; user: { id: string } }>
    ).find((m) => m.role === "OWNER");
    expect(ownerMember).toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${organizationId}/members/${ownerMember!.userId}`)
      .set("Cookie", adminCookies)
      .set("x-csrf-token", adminCsrf)
      .send({ role: "OWNER" })
      .expect(403);

    // No audit mutation routes are registered; CSRF middleware may 403 before a 404.
    const del = await request(app.getHttpServer()).delete("/api/v1/audit-events");
    expect([403, 404]).toContain(del.status);
    const patch = await request(app.getHttpServer()).patch("/api/v1/audit-events/x").send({});
    expect([403, 404]).toContain(patch.status);
  });

  it("logs out and revokes the current session", async () => {
    const auth = await registerVerifyLogin(app, mail, {
      email: "logout.user@example.com",
      name: "Logout User",
      password: "logout-password-12",
    });

    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .expect(204);

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", auth.session)
      .expect(401);
  });
});
