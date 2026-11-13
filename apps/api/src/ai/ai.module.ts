import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AiController } from "./ai.controller";
import { AI_QUEUE_NAME } from "./ai.queue";
import { AiService } from "./ai.service";

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: AI_QUEUE_NAME })],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
