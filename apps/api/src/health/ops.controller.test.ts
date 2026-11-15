import type { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { getQueueToken } from "@nestjs/bullmq";
import { Test } from "@nestjs/testing";
import { AI_QUEUE, DIAGNOSTICS_QUEUE, DOCUMENTS_QUEUE, REPORTS_QUEUE } from "@opero/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseApiEnv } from "../config/env";
import { PRISMA_CLIENT } from "../database/database.constants";
import { OpsController } from "./ops.controller";

function mockQueue() {
  return {
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
    getFailedCount: vi.fn().mockResolvedValue(1),
    getDelayedCount: vi.fn().mockResolvedValue(0),
  };
}

describe("GET /api/v1/ops/status", () => {
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
              APP_VERSION: "ops-test",
              APP_ENV: "test",
              PILOT_MODE: "true",
              PUBLIC_REGISTRATION_ENABLED: "false",
              REDIS_HOST: process.env.REDIS_HOST ?? "127.0.0.1",
              REDIS_PORT: process.env.REDIS_PORT ?? "63799",
              REDIS_PASSWORD: process.env.REDIS_PASSWORD ?? "replace-with-local-dev-password",
            }),
        }),
      ],
      controllers: [OpsController],
      providers: [
        {
          provide: PRISMA_CLIENT,
          useValue: {
            $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
          },
        },
        { provide: getQueueToken(DOCUMENTS_QUEUE), useValue: mockQueue() },
        { provide: getQueueToken(DIAGNOSTICS_QUEUE), useValue: mockQueue() },
        { provide: getQueueToken(AI_QUEUE), useValue: mockQueue() },
        { provide: getQueueToken(REPORTS_QUEUE), useValue: mockQueue() },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns non-secret pilot and queue snapshot without a token when unset", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/ops/status");
    expect([200]).toContain(response.status);
    expect(response.body.service).toBe("api");
    expect(response.body.version).toBe("ops-test");
    expect(response.body.appEnv).toBe("test");
    expect(response.body.pilot.mode).toBe(true);
    expect(response.body.pilot.publicRegistrationEnabled).toBe(false);
    expect(response.body.emergency.disableCheckout).toBe(false);
    expect(response.body.queues.documents.failed).toBe(1);
    expect(response.body.paymentProvider).toBe("mock");
    expect(["ok", "fail"]).toContain(response.body.checks.redis);
    expect(String(JSON.stringify(response.body))).not.toMatch(/CSRF_SECRET|password|sk_/i);
  });
});

