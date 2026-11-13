import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { WorkerEnv } from "../config/env";
import { loadDatabaseModule } from "../database/load-database";
import { AiInterpretProcessor } from "./ai-interpret.processor";
import { AI_QUEUE_NAME, PRISMA_CLIENT } from "./ai.constants";

@Module({
  imports: [BullModule.registerQueue({ name: AI_QUEUE_NAME })],
  providers: [
    {
      provide: PRISMA_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService<WorkerEnv, true>) => {
        const { createPrismaClient } = await loadDatabaseModule();
        return createPrismaClient(config.get("DATABASE_URL", { infer: true }));
      },
    },
    AiInterpretProcessor,
  ],
})
export class AiModule {}
