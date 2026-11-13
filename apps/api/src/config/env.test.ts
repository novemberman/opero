import { describe, expect, it } from "vitest";
import { parseApiEnv, resolveCookieSecure } from "./env";

const valid = {
  DATABASE_URL: "postgresql://opero:secret@127.0.0.1:54329/opero",
  CSRF_SECRET: "dev-csrf-secret-at-least-32-chars!!",
};

const deployedResend = {
  MAIL_DRIVER: "resend" as const,
  RESEND_API_KEY: "re_live_example_key_not_real",
  MAIL_FROM_ADDRESS: "Opero <noreply@opero.example>",
};

describe("parseApiEnv", () => {
  it("accepts a complete environment with defaults", () => {
    expect(parseApiEnv(valid).API_PORT).toBe(3001);
    expect(parseApiEnv(valid).SESSION_COOKIE_NAME).toBe("opero_session");
    expect(parseApiEnv(valid).AUTH_THROTTLE_DISABLED).toBe(false);
    expect(parseApiEnv(valid).AUTH_LOGIN_THROTTLE_LIMIT).toBe(10);
    expect(parseApiEnv(valid).MAIL_DRIVER).toBe("dev");
    expect(parseApiEnv(valid).MAIL_TIMEOUT_MS).toBe(15_000);
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
        DOCUMENT_STORAGE_DRIVER: "s3",
        S3_ENDPOINT: "https://s3.example.com",
        S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        S3_SECRET_ACCESS_KEY: "secretsecret",
        ...deployedResend,
        PAYMENT_PROVIDER: "korapay",
        KORAPAY_SECRET_KEY: "sk_live_examplekey",
        APP_ORIGIN: "https://app.example.com",
        REDIS_PASSWORD: "prod-redis-password",
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
        DOCUMENT_STORAGE_DRIVER: "s3",
        S3_ENDPOINT: "https://s3.example.com",
        S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        S3_SECRET_ACCESS_KEY: "secretsecret",
        ...deployedResend,
        PAYMENT_PROVIDER: "korapay",
        KORAPAY_SECRET_KEY: "sk_live_examplekey",
        APP_ORIGIN: "https://app.example.com",
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

  it("forbids mock payments and sk_test_ keys in production", () => {
    expect(() =>
      parseApiEnv({
        ...valid,
        NODE_ENV: "production",
        PAYMENT_PROVIDER: "mock",
        DOCUMENT_STORAGE_DRIVER: "s3",
        S3_ENDPOINT: "https://s3.example.com",
        S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        S3_SECRET_ACCESS_KEY: "secretsecret",
        ...deployedResend,
        APP_ORIGIN: "https://app.example.com",
        REDIS_PASSWORD: "prod-redis-password",
      }),
    ).toThrow(/PAYMENT_PROVIDER/);
    expect(() =>
      parseApiEnv({
        ...valid,
        NODE_ENV: "production",
        PAYMENT_PROVIDER: "korapay",
        KORAPAY_SECRET_KEY: "sk_test_not_for_prod",
        DOCUMENT_STORAGE_DRIVER: "s3",
        S3_ENDPOINT: "https://s3.example.com",
        S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        S3_SECRET_ACCESS_KEY: "secretsecret",
        ...deployedResend,
        APP_ORIGIN: "https://app.example.com",
        REDIS_PASSWORD: "prod-redis-password",
      }),
    ).toThrow(/sk_test_/);
  });

  it("forbids filesystem storage and dev mail in production", () => {
    expect(() =>
      parseApiEnv({
        ...valid,
        NODE_ENV: "production",
        DOCUMENT_STORAGE_DRIVER: "filesystem",
        MAIL_DRIVER: "dev",
        PAYMENT_PROVIDER: "korapay",
        KORAPAY_SECRET_KEY: "sk_live_examplekey",
        APP_ORIGIN: "https://app.example.com",
        REDIS_PASSWORD: "prod-redis-password",
      }),
    ).toThrow(/DOCUMENT_STORAGE_DRIVER|MAIL_DRIVER/);
  });

  it("forbids COOKIE_SECURE=false and http APP_ORIGIN in production", () => {
    expect(() =>
      parseApiEnv({
        ...valid,
        NODE_ENV: "production",
        COOKIE_SECURE: "false",
        DOCUMENT_STORAGE_DRIVER: "s3",
        S3_ENDPOINT: "https://s3.example.com",
        S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        S3_SECRET_ACCESS_KEY: "secretsecret",
        ...deployedResend,
        PAYMENT_PROVIDER: "korapay",
        KORAPAY_SECRET_KEY: "sk_live_examplekey",
        APP_ORIGIN: "http://app.example.com",
        REDIS_PASSWORD: "prod-redis-password",
      }),
    ).toThrow(/COOKIE_SECURE|APP_ORIGIN/);
  });

  it("forbids live Korapay keys in staging but allows sk_test_", () => {
    expect(() =>
      parseApiEnv({
        ...valid,
        NODE_ENV: "production",
        APP_ENV: "staging",
        DOCUMENT_STORAGE_DRIVER: "s3",
        S3_ENDPOINT: "https://s3.example.com",
        S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        S3_SECRET_ACCESS_KEY: "secretsecret",
        ...deployedResend,
        PAYMENT_PROVIDER: "korapay",
        KORAPAY_SECRET_KEY: "sk_live_should_not_be_here",
        APP_ORIGIN: "https://staging.example.com",
        REDIS_PASSWORD: "staging-redis-password",
      }),
    ).toThrow(/sk_live_/);

    expect(
      parseApiEnv({
        ...valid,
        NODE_ENV: "production",
        APP_ENV: "staging",
        DOCUMENT_STORAGE_DRIVER: "s3",
        S3_ENDPOINT: "https://s3.example.com",
        S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        S3_SECRET_ACCESS_KEY: "secretsecret",
        ...deployedResend,
        PAYMENT_PROVIDER: "korapay",
        KORAPAY_SECRET_KEY: "sk_test_staging_ok",
        APP_ORIGIN: "https://staging.example.com",
        REDIS_PASSWORD: "staging-redis-password",
      }).APP_ENV,
    ).toBe("staging");
  });

  it("rejects MAIL_DRIVER=smtp because no SMTP adapter exists", () => {
    expect(() =>
      parseApiEnv({
        ...valid,
        MAIL_DRIVER: "smtp",
        SMTP_URL: "smtps://user:pass@smtp.example.com:465",
      }),
    ).toThrow(/MAIL_DRIVER=smtp is not supported/);
  });

  it("requires Resend credentials when MAIL_DRIVER=resend", () => {
    expect(() =>
      parseApiEnv({
        ...valid,
        MAIL_DRIVER: "resend",
      }),
    ).toThrow(/RESEND_API_KEY|MAIL_FROM_ADDRESS/);

    expect(() =>
      parseApiEnv({
        ...valid,
        MAIL_DRIVER: "resend",
        RESEND_API_KEY: "replace-with-resend-api-key",
        MAIL_FROM_ADDRESS: "replace-with-verified-sender@example.com",
      }),
    ).toThrow(/RESEND_API_KEY|MAIL_FROM_ADDRESS/);
  });

  it("accepts MAIL_DRIVER=resend with API key and sender", () => {
    const env = parseApiEnv({
      ...valid,
      ...deployedResend,
    });
    expect(env.MAIL_DRIVER).toBe("resend");
    expect(env.RESEND_API_KEY).toBe(deployedResend.RESEND_API_KEY);
    expect(env.MAIL_FROM_ADDRESS).toBe(deployedResend.MAIL_FROM_ADDRESS);
  });

  it("forbids MAIL_DRIVER=dev in staging even when Resend vars are present", () => {
    expect(() =>
      parseApiEnv({
        ...valid,
        NODE_ENV: "production",
        APP_ENV: "staging",
        DOCUMENT_STORAGE_DRIVER: "s3",
        S3_ENDPOINT: "https://s3.example.com",
        S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        S3_SECRET_ACCESS_KEY: "secretsecret",
        MAIL_DRIVER: "dev",
        RESEND_API_KEY: deployedResend.RESEND_API_KEY,
        MAIL_FROM_ADDRESS: deployedResend.MAIL_FROM_ADDRESS,
        PAYMENT_PROVIDER: "korapay",
        KORAPAY_SECRET_KEY: "sk_test_staging_ok",
        APP_ORIGIN: "https://staging.example.com",
        REDIS_PASSWORD: "staging-redis-password",
      }),
    ).toThrow(/MAIL_DRIVER/);
  });

  it("resolves cookie secure defaults", () => {
    expect(resolveCookieSecure({ NODE_ENV: "development", COOKIE_SECURE: undefined })).toBe(false);
    expect(resolveCookieSecure({ NODE_ENV: "production", COOKIE_SECURE: undefined })).toBe(true);
    expect(resolveCookieSecure({ NODE_ENV: "development", COOKIE_SECURE: true })).toBe(true);
  });
});
