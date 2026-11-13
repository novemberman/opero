import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { WorkerEnv } from "../config/env";
import { loadDatabaseModule } from "../database/load-database";
import { DocumentsModule } from "../documents/documents.module";
import { ReportRenderProcessor } from "./report-render.processor";
import { PRISMA_CLIENT, REPORTS_QUEUE_NAME } from "./reports.constants";

@Module({
  // DocumentsModule provides the shared object storage client.
  imports: [BullModule.registerQueue({ name: REPORTS_QUEUE_NAME }), DocumentsModule],
  providers: [
    {
      provide: PRISMA_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService<WorkerEnv, true>) => {
        const { createPrismaClient } = await loadDatabaseModule();
        return createPrismaClient(config.get("DATABASE_URL", { infer: true }));
      },
    },
    ReportRenderProcessor,
  ],
})
export class ReportsModule {}
