import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { WorkerEnv } from "../config/env";
import { loadDatabaseModule } from "../database/load-database";
import { DiagnosticRunProcessor } from "./diagnostic-run.processor";
import { DIAGNOSTICS_QUEUE_NAME, PRISMA_CLIENT } from "./diagnostics.constants";

@Module({
  imports: [BullModule.registerQueue({ name: DIAGNOSTICS_QUEUE_NAME })],
  providers: [
    {
      provide: PRISMA_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService<WorkerEnv, true>) => {
        const { createPrismaClient } = await loadDatabaseModule();
        return createPrismaClient(config.get("DATABASE_URL", { infer: true }));
      },
    },
    DiagnosticRunProcessor,
  ],
})
export class DiagnosticsModule {}
