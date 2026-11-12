import { z } from "zod";

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CORS_ORIGINS: z.string().default("http://127.0.0.1:3000,http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
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
