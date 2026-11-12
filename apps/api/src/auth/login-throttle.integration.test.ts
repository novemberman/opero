import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../testing/app-factory";
import type { MemoryEmailService } from "../testing/memory-email.service";
import { loadDatabaseModule } from "../database/load-database";

/**
 * Enables real login throttling for this file only. Other suites keep
 * AUTH_THROTTLE_DISABLED=true via vitest.setup.ts so they stay deterministic.
 */
describe("login rate limiting", () => {
  let app: INestApplication;
  let mail: MemoryEmailService;
  let previousDisabled: string | undefined;
  let previousLimit: string | undefined;
  let previousTtl: string | undefined;

  beforeAll(async () => {
    previousDisabled = process.env.AUTH_THROTTLE_DISABLED;
    previousLimit = process.env.AUTH_LOGIN_THROTTLE_LIMIT;
    previousTtl = process.env.AUTH_LOGIN_THROTTLE_TTL_MS;

    // Keep process.env aligned for documentation assertions; ConfigService overrides
    // ensure the live LoginRateLimitGuard sees the testable limits.
    process.env.AUTH_THROTTLE_DISABLED = "false";
    process.env.AUTH_LOGIN_THROTTLE_LIMIT = "3";
    process.env.AUTH_LOGIN_THROTTLE_TTL_MS = "60000";

    const { createPrismaClient } = await loadDatabaseModule();
    const prisma = createPrismaClient(process.env.DATABASE_URL!);
    await prisma.session.deleteMany();
    await prisma.emailVerificationToken.deleteMany();
    await prisma.user.deleteMany({ where: { email: "throttle.user@example.com" } });
    await prisma.$disconnect();

    ({ app, mail } = await createTestApp({
      envOverrides: {
        AUTH_THROTTLE_DISABLED: false,
        AUTH_LOGIN_THROTTLE_LIMIT: 3,
        AUTH_LOGIN_THROTTLE_TTL_MS: 60_000,
      },
    }));

    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: "throttle.user@example.com",
        name: "Throttle User",
        password: "throttle-password-12",
      })
      .expect(201);
    const token = mail.latestToken("/verify-email");
    await request(app.getHttpServer())
      .post("/api/v1/auth/verify-email")
      .send({ token })
      .expect(204);
  });

  afterAll(async () => {
    await app.close();
    if (previousDisabled === undefined) {
      delete process.env.AUTH_THROTTLE_DISABLED;
    } else {
      process.env.AUTH_THROTTLE_DISABLED = previousDisabled;
    }
    if (previousLimit === undefined) {
      delete process.env.AUTH_LOGIN_THROTTLE_LIMIT;
    } else {
      process.env.AUTH_LOGIN_THROTTLE_LIMIT = previousLimit;
    }
    if (previousTtl === undefined) {
      delete process.env.AUTH_LOGIN_THROTTLE_TTL_MS;
    } else {
      process.env.AUTH_LOGIN_THROTTLE_TTL_MS = previousTtl;
    }
  });


  it("returns HTTP 429 after excessive login attempts", async () => {
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "throttle.user@example.com", password: "wrong-password-xx" })
        .expect(401);
    }

    const blocked = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "throttle.user@example.com", password: "wrong-password-xx" })
      .expect(429);

    expect(blocked.headers["retry-after"]).toBeTruthy();
    expect(blocked.headers["x-ratelimit-remaining"]).toBe("0");
  });

  it("does not allow a successful login to reset unlimited guessing within the window", async () => {
    // Still within the same IP bucket from the previous test — further attempts stay limited.
    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "throttle.user@example.com", password: "throttle-password-12" })
      .expect(429);
  });
});
