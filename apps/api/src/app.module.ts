import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { parseApiEnv, type ApiEnv } from "./config/env";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
      validate: (source) => parseApiEnv(source),
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnv, true>) => {
        const level = config.get("LOG_LEVEL", { infer: true });
        const nodeEnv = config.get("NODE_ENV", { infer: true });
        return {
          pinoHttp: {
            level,
            redact: ["req.headers.authorization", "req.headers.cookie"],
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
    HealthModule,
  ],
})
export class AppModule {}
