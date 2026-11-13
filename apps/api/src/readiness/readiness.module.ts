import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ReconciliationModule } from "../reconciliation/reconciliation.module";
import { ReadinessController } from "./readiness.controller";
import { ReadinessService } from "./readiness.service";

@Module({
  imports: [AuthModule, ReconciliationModule],
  controllers: [ReadinessController],
  providers: [ReadinessService],
  exports: [ReadinessService],
})
export class ReadinessModule {}
