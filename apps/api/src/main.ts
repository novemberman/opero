import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureApp } from "./configure-app";
import type { ApiEnv } from "./config/env";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<ApiEnv, true>);
  const trustProxy = config.get("TRUST_PROXY", { infer: true });
  if (trustProxy) {
    // Railway / reverse-proxy terminates TLS and forwards X-Forwarded-*.
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }

  const port = Number(process.env.PORT) || config.get("API_PORT", { infer: true });
  const env = {
    NODE_ENV: config.get("NODE_ENV", { infer: true }),
    API_HOST: config.get("API_HOST", { infer: true }),
    API_PORT: port,
    CORS_ORIGINS: config.get("CORS_ORIGINS", { infer: true }),
    LOG_LEVEL: config.get("LOG_LEVEL", { infer: true }),
  };

  configureApp(app, env);
  app.enableShutdownHooks();

  await app.listen(env.API_PORT, env.API_HOST);
  const version =
    config.get("APP_VERSION", { infer: true }) ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? "unknown";
  app.get(Logger).log(
    `API listening on http://${env.API_HOST}:${env.API_PORT}/api/v1 version=${version}`,
  );
}

void bootstrap();
