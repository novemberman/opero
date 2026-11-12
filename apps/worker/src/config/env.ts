import { z } from "zod";

const boolFromEnv = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .default(false)
  .transform((value) => value === true || value === "true" || value === "1");

export const workerEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
    S3_QUARANTINE_BUCKET: z.string().min(1).default("opero-quarantine"),
    S3_DOCUMENTS_BUCKET: z.string().min(1).default("opero-documents"),
    DOCUMENT_SCANNER_DRIVER: z.enum(["clamav", "mock"]).default("clamav"),
    CLAMAV_HOST: z.string().min(1).default("127.0.0.1"),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.DOCUMENT_SCANNER_DRIVER === "mock") {
      ctx.addIssue({
        code: "custom",
        path: ["DOCUMENT_SCANNER_DRIVER"],
        message: "DOCUMENT_SCANNER_DRIVER=mock is forbidden in production",
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
