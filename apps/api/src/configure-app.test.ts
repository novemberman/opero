import { Controller, Get, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureApp } from "./configure-app";

@Controller()
class ProbeController {
  @Get("probe")
  probe() {
    return { ok: true };
  }
}

describe("configureApp security baseline", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, {
      CORS_ORIGINS: "http://127.0.0.1:3000",
      NODE_ENV: "test",
      APP_ENV: "test",
      ENABLE_API_DOCS: false,
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sets baseline security headers and does not expose swagger when disabled", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/probe").expect(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(response.headers["x-powered-by"]).toBeUndefined();

    await request(app.getHttpServer()).get("/api/v1/docs").expect(404);
  });
});
