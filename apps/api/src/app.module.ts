import { randomUUID } from "node:crypto";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { CsrfMiddleware } from "./auth/csrf.middleware";
import { AuthorizationModule } from "./authorization/authorization.module";
import { CorrelationIdMiddleware } from "./common/correlation-id.middleware";
import { parseApiEnv, type ApiEnv } from "./config/env";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { OrganizationsModule } from "./organizations/organizations.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
      validate: (source) => parseApiEnv(source),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnv, true>) => {
        const loginLimit = config.get("AUTH_LOGIN_THROTTLE_LIMIT", { infer: true });
        const loginTtl = config.get("AUTH_LOGIN_THROTTLE_TTL_MS", { infer: true });
        return {
          // Never skip when NODE_ENV=production (also rejected by env schema).
          skipIf: () => config.get("AUTH_THROTTLE_DISABLED", { infer: true }) === true,
          throttlers: [
            {
              name: "default",
              ttl: 60_000,
              limit: 120,
            },
            {
              name: "login",
              ttl: loginTtl,
              limit: loginLimit,
            },
          ],
        };
      },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnv, true>) => {
        const level = config.get("LOG_LEVEL", { infer: true });
        const nodeEnv = config.get("NODE_ENV", { infer: true });
        return {
          pinoHttp: {
            level,
            genReqId: (req): string => {
              const existing = (req as { requestId?: string }).requestId;
              return typeof existing === "string" && existing.length > 0
                ? existing
                : randomUUID();
            },
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "req.body.password",
                "req.body.token",
                "req.body.csrfToken",
                'res.headers["set-cookie"]',
              ],

              censor: "[Redacted]",
            },

            serializers: {
              req(req) {
                return {
                  id: req.id,
                  method: req.method,
                  url: req.url,
                  query: req.query,
                  params: req.params,
                  headers: {
                    host: req.headers.host,
                    "user-agent": req.headers["user-agent"],
                    "content-type": req.headers["content-type"],
                    origin: req.headers.origin,
                    // never log cookie or authorization
                  },
                  remoteAddress: req.remoteAddress,
                  remotePort: req.remotePort,
                };
              },
            },
            transport:
              nodeEnv === "development"
                ? {
                    target: "pino-pretty",
                    options: { singleLine: true, translateTime: "SYS:standard" },
                  }
                : undefined,
          },
        };
      },
    }),
    DatabaseModule,
    AuditModule,
    AuthorizationModule,
    AuthModule,
    OrganizationsModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware, CsrfMiddleware).forRoutes("*path");
  }
}
