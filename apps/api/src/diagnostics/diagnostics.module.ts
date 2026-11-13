import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DiagnosticsController } from "./diagnostics.controller";
import { DIAGNOSTICS_QUEUE_NAME } from "./diagnostics.queue";
import { DiagnosticsService } from "./diagnostics.service";

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: DIAGNOSTICS_QUEUE_NAME })],
  controllers: [DiagnosticsController],
  providers: [DiagnosticsService],
  exports: [DiagnosticsService],
})
export class DiagnosticsModule {}
