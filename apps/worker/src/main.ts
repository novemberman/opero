import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Logger } from "nestjs-pino";
import { Redis } from "ioredis";
import { AppModule } from "./app.module";
import type { WorkerEnv } from "./config/env";

async function assertRedis(config: ConfigService<WorkerEnv, true>): Promise<void> {
  const redis = new Redis({
    host: config.get("REDIS_HOST", { infer: true }),
    port: config.get("REDIS_PORT", { infer: true }),
    password: config.get("REDIS_PASSWORD", { infer: true }),
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: 5_000,
  });
  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong !== "PONG") {
      throw new Error(`Unexpected Redis PING response: ${pong}`);
    }
  } finally {
    redis.disconnect();
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const config = app.get(ConfigService<WorkerEnv, true>);
  const logger = app.get(Logger);
  const version =
    config.get("APP_VERSION", { infer: true }) ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? "unknown";

  await assertRedis(config);
  logger.log(`Opero worker is ready version=${version}`);

  const shutdown = async (signal: string) => {
    logger.log(`Worker shutting down on ${signal}`);
    await app.close();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

void bootstrap();
