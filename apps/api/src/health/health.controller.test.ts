import type { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { healthResponseSchema, readinessResponseSchema } from "@opero/shared";
import { MemoryObjectStorage } from "@opero/object-storage";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseApiEnv } from "../config/env";
import { PRISMA_CLIENT } from "../database/database.constants";
import { OBJECT_STORAGE } from "../storage/storage.constants";
import { HealthController } from "./health.controller";

describe("GET /api/v1/health and /ready", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validate: () =>
            parseApiEnv({
              DATABASE_URL: "postgresql://opero:secret@127.0.0.1:54329/opero",
              CSRF_SECRET: "dev-csrf-secret-at-least-32-chars!!",
              DOCUMENT_STORAGE_DRIVER: "memory",
              DOCUMENT_SCANNER_DRIVER: "mock",
              APP_VERSION: "test-version",
              REDIS_HOST: process.env.REDIS_HOST ?? "127.0.0.1",
              REDIS_PORT: process.env.REDIS_PORT ?? "63799",
              REDIS_PASSWORD: process.env.REDIS_PASSWORD ?? "replace-with-local-dev-password",
            }),
        }),
      ],
      controllers: [HealthController],
      providers: [
        {
          provide: PRISMA_CLIENT,
          useValue: {
            $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
          },
        },
        { provide: OBJECT_STORAGE, useValue: new MemoryObjectStorage() },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the shared API health contract with version", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health").expect(200);
    const parsed = healthResponseSchema.parse(response.body);
    expect(parsed.service).toBe("api");
    expect(parsed.version).toBe("test-version");
  });

  it("returns readiness when dependencies respond", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/ready");
    // Redis may be up (200) or down (503) in local CI; schema must still validate.
    expect([200, 503]).toContain(response.status);
    const parsed = readinessResponseSchema.parse(response.body);
    expect(parsed.service).toBe("api");
    expect(parsed.checks.database).toBe("ok");
    expect(parsed.checks.storage).toBe("ok");
    expect(["ok", "fail"]).toContain(parsed.checks.redis);
  });
});
