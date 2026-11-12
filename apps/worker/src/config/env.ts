import { z } from "zod";

export const workerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  REDIS_HOST: z.string().min(1).default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(63799),
  REDIS_PASSWORD: z.string().min(1),
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
