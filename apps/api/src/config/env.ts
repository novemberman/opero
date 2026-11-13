import { z } from "zod";

const boolFromEnv = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .default(false)
  .transform((value) => value === true || value === "true" || value === "1");

export const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["development", "test", "staging", "production"]).optional(),
    APP_VERSION: z.string().min(1).optional(),
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    CORS_ORIGINS: z.string().default("http://127.0.0.1:3000,http://localhost:3000"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    DATABASE_URL: z.string().min(1),
    APP_ORIGIN: z.string().url().default("http://127.0.0.1:3000"),
    SESSION_COOKIE_NAME: z.string().min(1).default("opero_session"),
    CSRF_COOKIE_NAME: z.string().min(1).default("opero_csrf"),
    CSRF_SECRET: z.string().min(32),
    COOKIE_SECURE: z
      .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        return value === true || value === "true" || value === "1";
      }),
    COOKIE_DOMAIN: z.string().min(1).optional(),
    TRUST_PROXY: boolFromEnv.default(false),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    AUTH_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    MAIL_DRIVER: z.enum(["dev", "smtp", "resend"]).default("dev"),
    MAIL_DIR: z.string().min(1).default(".data/mail"),
    MAIL_FROM_ADDRESS: z.string().min(3).optional(),
    MAIL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
    SMTP_URL: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    AUTH_THROTTLE_DISABLED: boolFromEnv,
    AUTH_LOGIN_THROTTLE_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
    AUTH_LOGIN_THROTTLE_TTL_MS: z.coerce.number().int().min(1000).max(3_600_000).default(60_000),
    REDIS_HOST: z.string().min(1).default("127.0.0.1"),
    REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(63799),
    REDIS_PASSWORD: z.string().min(1).default("replace-with-local-dev-password"),
    DOCUMENT_STORAGE_DRIVER: z.enum(["filesystem", "s3", "memory"]).default("filesystem"),
    DOCUMENT_STORAGE_ROOT: z.string().min(1).default(".data/object-storage"),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default("us-east-1"),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: boolFromEnv.default(true),
    S3_SSE: z.enum(["none", "AES256"]).default("none"),
    S3_QUARANTINE_BUCKET: z.string().min(1).default("opero-quarantine"),
    S3_DOCUMENTS_BUCKET: z.string().min(1).default("opero-documents"),
    /** Defaults to documents bucket; use a dedicated bucket in staging/prod when provisioned. */
    S3_REPORTS_BUCKET: z.string().min(1).optional(),
    S3_PRESIGN_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
    DOCUMENT_MAX_BYTES: z.coerce.number().int().min(1024).max(50_000_000).default(20_971_520),
    DOCUMENT_UPLOAD_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
    DOCUMENT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(365),
    DOCUMENT_SCANNER_DRIVER: z.enum(["clamav", "mock"]).default("clamav"),
    CLAMAV_HOST: z.string().min(1).default("127.0.0.1"),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
    AI_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().url().optional(),
    OPENAI_MODEL: z.string().min(1).optional(),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
    AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
    AI_SHARE_STRUCTURED_CONTEXT: boolFromEnv.default(true),
    PAYMENT_PROVIDER: z.enum(["mock", "korapay"]).default("mock"),
    KORAPAY_SECRET_KEY: z.string().min(8).optional(),
    KORAPAY_PUBLIC_KEY: z.string().min(8).optional(),
    KORAPAY_BASE_URL: z.string().url().default("https://api.korapay.com"),
    BILLING_WEBHOOK_BASE_URL: z.string().url().optional(),
  })
  .superRefine((env, ctx) => {
    // Prefer APP_ENV when set so Railway staging can use NODE_ENV=production runtime
    // optimizations without applying live-payment rules.
    const appEnv =
      env.APP_ENV ?? (env.NODE_ENV === "production" ? "production" : env.NODE_ENV);
    const isProduction = appEnv === "production";
    const isStaging = appEnv === "staging";
    const isDeployed = isProduction || isStaging;

    if (isProduction && env.AUTH_THROTTLE_DISABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_THROTTLE_DISABLED"],
        message: "AUTH_THROTTLE_DISABLED cannot be enabled in production",
      });
    }
    if (isDeployed && env.DOCUMENT_SCANNER_DRIVER === "mock") {
      ctx.addIssue({
        code: "custom",
        path: ["DOCUMENT_SCANNER_DRIVER"],
        message: "DOCUMENT_SCANNER_DRIVER=mock is forbidden in staging/production",
      });
    }
    if (
      isDeployed &&
      (env.DOCUMENT_STORAGE_DRIVER === "filesystem" || env.DOCUMENT_STORAGE_DRIVER === "memory")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["DOCUMENT_STORAGE_DRIVER"],
        message:
          "DOCUMENT_STORAGE_DRIVER must be s3 in staging/production (ephemeral FS forbidden)",
      });
    }
    if (isDeployed && env.MAIL_DRIVER === "dev") {
      ctx.addIssue({
        code: "custom",
        path: ["MAIL_DRIVER"],
        message: "MAIL_DRIVER=dev is forbidden in staging/production",
      });
    }
    if (env.MAIL_DRIVER === "smtp") {
      ctx.addIssue({
        code: "custom",
        path: ["MAIL_DRIVER"],
        message:
          "MAIL_DRIVER=smtp is not supported: no SMTP adapter is configured. Use MAIL_DRIVER=resend or MAIL_DRIVER=dev",
      });
    }
    if (env.MAIL_DRIVER === "resend") {
      const apiKey = env.RESEND_API_KEY?.trim() ?? "";
      const fromAddress = env.MAIL_FROM_ADDRESS?.trim() ?? "";
      if (!apiKey || apiKey.includes("replace-with") || apiKey.length < 8) {
        ctx.addIssue({
          code: "custom",
          path: ["RESEND_API_KEY"],
          message: "RESEND_API_KEY is required when MAIL_DRIVER=resend",
        });
      }
      if (!fromAddress || fromAddress.includes("replace-with") || !fromAddress.includes("@")) {
        ctx.addIssue({
          code: "custom",
          path: ["MAIL_FROM_ADDRESS"],
          message: "MAIL_FROM_ADDRESS is required when MAIL_DRIVER=resend",
        });
      }
    }
    if (isDeployed && env.COOKIE_SECURE === false) {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SECURE"],
        message: "COOKIE_SECURE=false is forbidden in staging/production",
      });
    }
    if (isDeployed && !env.APP_ORIGIN.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_ORIGIN"],
        message: "APP_ORIGIN must be https in staging/production",
      });
    }
    if (isDeployed && env.CSRF_SECRET.includes("replace-with")) {
      ctx.addIssue({
        code: "custom",
        path: ["CSRF_SECRET"],
        message: "CSRF_SECRET placeholder is forbidden in staging/production",
      });
    }
    if (isDeployed && env.REDIS_PASSWORD.includes("replace-with")) {
      ctx.addIssue({
        code: "custom",
        path: ["REDIS_PASSWORD"],
        message: "REDIS_PASSWORD placeholder is forbidden in staging/production",
      });
    }
    if (env.DOCUMENT_STORAGE_DRIVER === "s3") {
      if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["S3_ENDPOINT"],
          message: "S3 endpoint and credentials are required when DOCUMENT_STORAGE_DRIVER=s3",
        });
      }
      if (
        isDeployed &&
        env.S3_ENDPOINT?.startsWith("http://") &&
        !env.S3_ENDPOINT.includes("127.0.0.1")
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["S3_ENDPOINT"],
          message: "S3_ENDPOINT must use https in staging/production (except local loopback)",
        });
      }
    }
    if (env.AI_PROVIDER === "openai") {
      if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL) {
        ctx.addIssue({
          code: "custom",
          path: ["OPENAI_API_KEY"],
          message: "OPENAI_API_KEY and OPENAI_MODEL are required when AI_PROVIDER=openai",
        });
      }
    }
    if (env.PAYMENT_PROVIDER === "korapay" && !env.KORAPAY_SECRET_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["KORAPAY_SECRET_KEY"],
        message: "KORAPAY_SECRET_KEY is required when PAYMENT_PROVIDER=korapay",
      });
    }
    if (isProduction && env.PAYMENT_PROVIDER === "mock") {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENT_PROVIDER"],
        message: "PAYMENT_PROVIDER=mock is forbidden in production",
      });
    }
    if (
      isProduction &&
      env.PAYMENT_PROVIDER === "korapay" &&
      env.KORAPAY_SECRET_KEY?.startsWith("sk_test_")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["KORAPAY_SECRET_KEY"],
        message: "sk_test_ keys are forbidden in production; use sk_live_ after KYC activation",
      });
    }
    if (isStaging && env.KORAPAY_SECRET_KEY?.startsWith("sk_live_")) {
      ctx.addIssue({
        code: "custom",
        path: ["KORAPAY_SECRET_KEY"],
        message: "sk_live_ keys are forbidden in staging; use sk_test_",
      });
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function parseApiEnv(source: unknown): ApiEnv {
  const parsed = apiEnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid API environment\n${details}`);
  }
  return parsed.data;
}

/** Effective cookie Secure flag (production defaults to true). */
export function resolveCookieSecure(env: Pick<ApiEnv, "NODE_ENV" | "COOKIE_SECURE">): boolean {
  if (env.COOKIE_SECURE != null) return env.COOKIE_SECURE;
  return env.NODE_ENV === "production";
}
