import { z } from "zod";

const boolFromEnv = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .default(false)
  .transform((value) => value === true || value === "true" || value === "1");

export const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    CORS_ORIGINS: z.string().default("http://127.0.0.1:3000,http://localhost:3000"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    DATABASE_URL: z.string().min(1),
    APP_ORIGIN: z.string().url().default("http://127.0.0.1:3000"),
    SESSION_COOKIE_NAME: z.string().min(1).default("opero_session"),
    CSRF_COOKIE_NAME: z.string().min(1).default("opero_csrf"),
    CSRF_SECRET: z.string().min(32),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    AUTH_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    MAIL_DRIVER: z.enum(["dev"]).default("dev"),
    MAIL_DIR: z.string().min(1).default(".data/mail"),
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
    S3_QUARANTINE_BUCKET: z.string().min(1).default("opero-quarantine"),
    S3_DOCUMENTS_BUCKET: z.string().min(1).default("opero-documents"),
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
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.AUTH_THROTTLE_DISABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_THROTTLE_DISABLED"],
        message: "AUTH_THROTTLE_DISABLED cannot be enabled in production",
      });
    }
    if (env.NODE_ENV === "production" && env.DOCUMENT_SCANNER_DRIVER === "mock") {
      ctx.addIssue({
        code: "custom",
        path: ["DOCUMENT_SCANNER_DRIVER"],
        message: "DOCUMENT_SCANNER_DRIVER=mock is forbidden in production",
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
