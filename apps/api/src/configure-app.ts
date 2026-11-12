import { ValidationPipe, type INestApplication } from "@nestjs/common";
import type { ApiEnv } from "./config/env";

export function configureApp(app: INestApplication, env: Pick<ApiEnv, "CORS_ORIGINS">): void {
  const server = app.getHttpAdapter().getInstance() as { disable?: (setting: string) => void };
  server.disable?.("x-powered-by");
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const origins = env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.enableCors({
    origin: origins,
    credentials: true,
  });
}
