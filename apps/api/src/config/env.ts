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
    /**
     * When true, ThrottlerGuard skips limits. Forbidden in production.
     * Use only for non-throttle integration tests so they stay deterministic.
     */
    AUTH_THROTTLE_DISABLED: boolFromEnv,
    AUTH_LOGIN_THROTTLE_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
    AUTH_LOGIN_THROTTLE_TTL_MS: z.coerce.number().int().min(1000).max(3_600_000).default(60_000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.AUTH_THROTTLE_DISABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_THROTTLE_DISABLED"],
        message: "AUTH_THROTTLE_DISABLED cannot be enabled in production",
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
