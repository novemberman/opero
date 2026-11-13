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
        DOCUMENT_STORAGE_DRIVER: "s3",
        S3_ENDPOINT: "https://s3.example.com",
        S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        S3_SECRET_ACCESS_KEY: "secretsecret",
        REDIS_PASSWORD: "prod-redis-password",
      }),
    ).toThrow(/DOCUMENT_SCANNER_DRIVER/);
  });

  it("defaults AI provider to mock", () => {
    expect(parseWorkerEnv(valid).AI_PROVIDER).toBe("mock");
  });

  it("requires OpenAI credentials when AI_PROVIDER=openai", () => {
    expect(() => parseWorkerEnv({ ...valid, AI_PROVIDER: "openai" })).toThrow(/OPENAI_API_KEY/);
  });

  it("accepts development defaults", () => {
    expect(parseWorkerEnv(valid).DOCUMENT_STORAGE_DRIVER).toBe("filesystem");
  });

  it("rejects filesystem storage in production", () => {
    expect(() =>
      parseWorkerEnv({
        ...valid,
        NODE_ENV: "production",
        DOCUMENT_STORAGE_DRIVER: "filesystem",
        REDIS_PASSWORD: "prod-redis-password",
      }),
    ).toThrow(/DOCUMENT_STORAGE_DRIVER/);
  });

  it("requires S3 credentials when driver=s3", () => {
    expect(() =>
      parseWorkerEnv({
        ...valid,
        DOCUMENT_STORAGE_DRIVER: "s3",
      }),
    ).toThrow(/S3_ENDPOINT/);
  });
});
