import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ReadinessModule } from "../readiness/readiness.module";
import { ReconciliationModule } from "../reconciliation/reconciliation.module";
import { ReportsController } from "./reports.controller";
import { REPORTS_QUEUE_NAME } from "./reports.queue";
import { ReportsService } from "./reports.service";

@Module({
  imports: [
    AuthModule,
    ReadinessModule,
    ReconciliationModule,
    BullModule.registerQueue({ name: REPORTS_QUEUE_NAME }),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
