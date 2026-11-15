import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import type { Request, Response, NextFunction } from "express";
import {
  resolveAppEnv,
  resolveEnableApiDocs,
  type ApiEnv,
} from "./config/env";

export type ConfigureAppEnv = Pick<ApiEnv, "CORS_ORIGINS" | "NODE_ENV"> &
  Partial<Pick<ApiEnv, "APP_ENV" | "ENABLE_API_DOCS">>;

export function configureApp(app: INestApplication, env: ConfigureAppEnv): void {
  const server = app.getHttpAdapter().getInstance() as { disable?: (setting: string) => void };
  server.disable?.("x-powered-by");
  app.use(cookieParser());
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

  const appEnv = resolveAppEnv(env);
  const isProduction = appEnv === "production";

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (isProduction) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  if (resolveEnableApiDocs(env)) {
    const swagger = new DocumentBuilder()
      .setTitle("Opero API")
      .setDescription("Opero platform API — authentication and organization management")
      .setVersion("0.3.0")
      .addCookieAuth("opero_session")
      .build();
    const document = SwaggerModule.createDocument(app, swagger);
    SwaggerModule.setup("api/v1/docs", app, document);
  }
}
