import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { healthResponseSchema } from "@opero/shared";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { configureApp } from "../configure-app";
import { HealthController } from "./health.controller";

describe("GET /api/v1/health", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: "http://127.0.0.1:3000" });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the shared API health contract", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health").expect(200);
    const parsed = healthResponseSchema.parse(response.body);
    expect(parsed).toMatchObject({ status: "ok", service: "api" });
  });

  it("allows the configured web origin", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/health")
      .set("Origin", "http://127.0.0.1:3000")
      .expect(200)
      .expect("access-control-allow-origin", "http://127.0.0.1:3000");
  });
});
