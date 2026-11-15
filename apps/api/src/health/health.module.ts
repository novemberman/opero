import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AI_QUEUE, DIAGNOSTICS_QUEUE, DOCUMENTS_QUEUE, REPORTS_QUEUE } from "@opero/shared";
import { HealthController } from "./health.controller";
import { OpsController } from "./ops.controller";

@Module({
  imports: [
    BullModule.registerQueue(
      { name: DOCUMENTS_QUEUE },
      { name: DIAGNOSTICS_QUEUE },
      { name: AI_QUEUE },
      { name: REPORTS_QUEUE },
    ),
  ],
  controllers: [HealthController, OpsController],
})
export class HealthModule {}
