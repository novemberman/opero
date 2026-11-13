import { describe, expect, it } from "vitest";
import { parseWorkerEnv } from "./env";

const valid = {
  REDIS_HOST: "127.0.0.1",
  REDIS_PORT: "63799",
  REDIS_PASSWORD: "local-dev-password",
  DATABASE_URL: "postgresql://opero:secret@127.0.0.1:54329/opero",
};

describe("parseWorkerEnv", () => {
  it("reads the Redis connection from the environment", () => {
    const env = parseWorkerEnv(valid);

    expect(env).toMatchObject({
      REDIS_HOST: "127.0.0.1",
      REDIS_PORT: 63799,
      REDIS_PASSWORD: "local-dev-password",
    });
  });

  it("rejects a missing Redis password", () => {
    expect(() => parseWorkerEnv({ REDIS_HOST: "127.0.0.1" })).toThrow(/Invalid worker environment/);
  });

  it("forbids mock scanner in production", () => {
    expect(() =>
      parseWorkerEnv({
        ...valid,
        NODE_ENV: "production",
        DOCUMENT_SCANNER_DRIVER: "mock",
      }),
    ).toThrow(/DOCUMENT_SCANNER_DRIVER/);
  });

  it("defaults AI provider to mock", () => {
    expect(parseWorkerEnv(valid).AI_PROVIDER).toBe("mock");
  });

  it("requires OpenAI credentials when AI_PROVIDER=openai", () => {
    expect(() => parseWorkerEnv({ ...valid, AI_PROVIDER: "openai" })).toThrow(/OPENAI_API_KEY/);
  });
});
