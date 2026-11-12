import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import type { ApiEnv } from "./config/env";

export function configureApp(
  app: INestApplication,
  env: Pick<ApiEnv, "CORS_ORIGINS"> & Partial<Pick<ApiEnv, "NODE_ENV">>,
): void {
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

  const swagger = new DocumentBuilder()
    .setTitle("Opero API")
    .setDescription("Opero platform API — authentication and organization management")
    .setVersion("0.3.0")
    .addCookieAuth("opero_session")
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup("api/v1/docs", app, document);
}
