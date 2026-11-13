import { describe, expect, it } from "vitest";
import { parseApiEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://opero:secret@127.0.0.1:54329/opero",
  CSRF_SECRET: "dev-csrf-secret-at-least-32-chars!!",
};

describe("parseApiEnv", () => {
  it("accepts a complete environment with defaults", () => {
    expect(parseApiEnv(valid).API_PORT).toBe(3001);
    expect(parseApiEnv(valid).SESSION_COOKIE_NAME).toBe("opero_session");
    expect(parseApiEnv(valid).AUTH_THROTTLE_DISABLED).toBe(false);
    expect(parseApiEnv(valid).AUTH_LOGIN_THROTTLE_LIMIT).toBe(10);
  });

  it("requires DATABASE_URL and CSRF_SECRET", () => {
    expect(() => parseApiEnv({})).toThrow(/Invalid API environment/);
    expect(() => parseApiEnv({ DATABASE_URL: valid.DATABASE_URL })).toThrow(/CSRF_SECRET/);
  });

  it("rejects an invalid port", () => {
    expect(() => parseApiEnv({ ...valid, API_PORT: 0 })).toThrow(/API_PORT/);
  });

  it("forbids disabling auth throttling in production", () => {
    expect(() =>
      parseApiEnv({
        ...valid,
        NODE_ENV: "production",
        AUTH_THROTTLE_DISABLED: "true",
      }),
    ).toThrow(/AUTH_THROTTLE_DISABLED/);
  });

  it("allows AUTH_THROTTLE_DISABLED only outside production", () => {
    expect(
      parseApiEnv({
        ...valid,
        NODE_ENV: "test",
        AUTH_THROTTLE_DISABLED: "true",
      }).AUTH_THROTTLE_DISABLED,
    ).toBe(true);
  });

  it("forbids mock malware scanner in production", () => {
    expect(() =>
      parseApiEnv({
        ...valid,
        NODE_ENV: "production",
        DOCUMENT_SCANNER_DRIVER: "mock",
        REDIS_PASSWORD: "prod-redis-password",
      }),
    ).toThrow(/DOCUMENT_SCANNER_DRIVER/);
  });

  it("defaults document max bytes to 20 MB", () => {
    expect(parseApiEnv(valid).DOCUMENT_MAX_BYTES).toBe(20_971_520);
  });

  it("defaults AI provider to mock", () => {
    expect(parseApiEnv(valid).AI_PROVIDER).toBe("mock");
    expect(parseApiEnv(valid).AI_SHARE_STRUCTURED_CONTEXT).toBe(true);
  });

  it("requires OpenAI credentials when AI_PROVIDER=openai", () => {
    expect(() =>
      parseApiEnv({
        ...valid,
        AI_PROVIDER: "openai",
      }),
    ).toThrow(/OPENAI_API_KEY/);
  });
});
