import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import request from "supertest";
import { OrganizationsService } from "./organizations.service";
import { createTestApp, getCookie, mergeCookies } from "../testing/app-factory";
import type { MemoryEmailService } from "../testing/memory-email.service";
import { loadDatabaseModule } from "../database/load-database";
import { PRISMA_CLIENT } from "../database/database.constants";
import type { PrismaClient } from "@opero/database";

async function registerVerifyLogin(
  app: INestApplication,
  mail: MemoryEmailService,
  user: { email: string; name: string; password: string },
) {
  await request(app.getHttpServer()).post("/api/v1/auth/register").send(user).expect(201);
  const token = mail.latestToken("/verify-email");
  await request(app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(204);
  const login = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email: user.email, password: user.password })
    .expect(200);
  const session = getCookie(
    login.headers["set-cookie"],
    process.env.SESSION_COOKIE_NAME ?? "opero_session",
  )!;
  const csrfRes = await request(app.getHttpServer())
    .get("/api/v1/auth/csrf")
    .set("Cookie", session)
    .expect(200);
  const csrfCookie = getCookie(
    csrfRes.headers["set-cookie"],
    process.env.CSRF_COOKIE_NAME ?? "opero_csrf",
  );
  return {
    session,
    cookies: mergeCookies(session, csrfCookie),
    csrfToken: csrfRes.body.csrfToken as string,
  };
}

describe("concurrent final-owner protection", () => {
  let app: INestApplication;
  let mail: MemoryEmailService;
  let prisma: PrismaClient;
  let organizations: OrganizationsService;

  beforeAll(async () => {
    const db = await loadDatabaseModule();
    prisma = db.createPrismaClient(process.env.DATABASE_URL!);
    await prisma.auditEvent.deleteMany();
    await prisma.organizationInvitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.session.deleteMany();
    await prisma.emailVerificationToken.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.organization.deleteMany({ where: { slug: { startsWith: "concurrent-" } } });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            "concurrent.owner.a@example.com",
            "concurrent.owner.b@example.com",
            "concurrent.solo@example.com",
          ],
        },
      },
    });

    ({ app, mail } = await createTestApp());
    organizations = app.get(OrganizationsService);
    prisma = app.get(PRISMA_CLIENT);
  });

  afterAll(async () => {
    await app.close();
  });

  it("keeps at least one owner when two owners demote each other concurrently", async () => {
    const a = await registerVerifyLogin(app, mail, {
      email: "concurrent.owner.a@example.com",
      name: "Owner A",
      password: "concurrent-password-a",
    });
    const b = await registerVerifyLogin(app, mail, {
      email: "concurrent.owner.b@example.com",
      name: "Owner B",
      password: "concurrent-password-b",
    });

    const created = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", a.cookies)
      .set("x-csrf-token", a.csrfToken)
      .send({ name: "Concurrent Org", slug: "concurrent-dual-owners" })
      .expect(201);
    const organizationId = created.body.organization.id as string;

    const userA = await prisma.user.findUniqueOrThrow({
      where: { email: "concurrent.owner.a@example.com" },
    });
    const userB = await prisma.user.findUniqueOrThrow({
      where: { email: "concurrent.owner.b@example.com" },
    });

    await prisma.membership.create({
      data: {
        organizationId,
        userId: userB.id,
        role: "OWNER",
      },
    });

    const results = await Promise.allSettled([
      organizations.changeRole({
        organizationId,
        memberUserId: userB.id,
        role: "ADMIN",
        actorUserId: userA.id,
        actorRole: "OWNER",
      }),
      organizations.changeRole({
        organizationId,
        memberUserId: userA.id,
        role: "ADMIN",
        actorUserId: userB.id,
        actorRole: "OWNER",
      }),
    ]);

    const owners = await prisma.membership.count({
      where: { organizationId, role: "OWNER" },
    });
    expect(owners).toBeGreaterThanOrEqual(1);

    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toBeGreaterThanOrEqual(1);
    expect(rejected.length + fulfilled).toBe(2);
    for (const result of rejected) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        // ForbiddenException from last-owner guard, or Prisma serialization conflict
        // under concurrent Serializable transactions — both preserve ≥1 owner.
        const reason = result.reason as { name?: string; code?: string };
        const ok =
          result.reason instanceof ForbiddenException ||
          reason?.name === "PrismaClientKnownRequestError" ||
          reason?.code === "P2034";
        expect(ok).toBe(true);
      }
    }

    // silence unused cookie refs if lint complains
    expect(b.session).toBeTruthy();
  });

  it("rejects concurrent leave attempts by the sole owner", async () => {
    const solo = await registerVerifyLogin(app, mail, {
      email: "concurrent.solo@example.com",
      name: "Solo Owner",
      password: "concurrent-password-s",
    });

    const created = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", solo.cookies)
      .set("x-csrf-token", solo.csrfToken)
      .send({ name: "Solo Org", slug: "concurrent-solo-owner" })
      .expect(201);
    const organizationId = created.body.organization.id as string;
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "concurrent.solo@example.com" },
    });

    const results = await Promise.allSettled([
      organizations.leave({ organizationId, userId: user.id }),
      organizations.leave({ organizationId, userId: user.id }),
      organizations.removeMember({
        organizationId,
        memberUserId: user.id,
        actorUserId: user.id,
      }),
    ]);

    expect(results.every((r) => r.status === "rejected")).toBe(true);
    const owners = await prisma.membership.count({
      where: { organizationId, role: "OWNER" },
    });
    expect(owners).toBe(1);
  });
});
