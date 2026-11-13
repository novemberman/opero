import { z } from "zod";

const boolFromEnv = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .default(false)
  .transform((value) => value === true || value === "true" || value === "1");

export const workerEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["development", "test", "staging", "production"]).optional(),
    APP_VERSION: z.string().min(1).optional(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    REDIS_HOST: z.string().min(1).default("127.0.0.1"),
    REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(63799),
    REDIS_PASSWORD: z.string().min(1),
    DATABASE_URL: z.string().min(1),
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
    S3_REPORTS_BUCKET: z.string().min(1).optional(),
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
    const appEnv =
      env.APP_ENV ?? (env.NODE_ENV === "production" ? "production" : env.NODE_ENV);
    const isDeployed = appEnv === "production" || appEnv === "staging";

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
        message: "DOCUMENT_STORAGE_DRIVER must be s3 in staging/production (ephemeral FS forbidden)",
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
    if (isDeployed && env.REDIS_PASSWORD.includes("replace-with")) {
      ctx.addIssue({
        code: "custom",
        path: ["REDIS_PASSWORD"],
        message: "REDIS_PASSWORD placeholder is forbidden in staging/production",
      });
    }
  });

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function parseWorkerEnv(source: unknown): WorkerEnv {
  const parsed = workerEnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid worker environment\n${details}`);
  }
  return parsed.data;
}
