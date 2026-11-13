import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { AiModule } from "./ai/ai.module";
import { parseWorkerEnv, type WorkerEnv } from "./config/env";
import { DiagnosticsModule } from "./diagnostics/diagnostics.module";
import { DocumentsModule } from "./documents/documents.module";
import { ExampleModule } from "./example/example.module";
import { ReportsModule } from "./reports/reports.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
      validate: (source) => parseWorkerEnv(source),
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<WorkerEnv, true>) => {
        const level = config.get("LOG_LEVEL", { infer: true });
        const nodeEnv = config.get("NODE_ENV", { infer: true });
        return {
          pinoHttp: {
            level,
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
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<WorkerEnv, true>) => ({
        connection: {
          host: config.get("REDIS_HOST", { infer: true }),
          port: config.get("REDIS_PORT", { infer: true }),
          password: config.get("REDIS_PASSWORD", { infer: true }),
          maxRetriesPerRequest: null,
        },
      }),
    }),
    ExampleModule,
    DocumentsModule,
    DiagnosticsModule,
    AiModule,
    ReportsModule,
  ],
})
export class AppModule {}
