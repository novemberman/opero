import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DocumentsController } from "./documents.controller";
import { DOCUMENTS_QUEUE_NAME } from "./documents.queue";
import { DocumentsService } from "./documents.service";
import { RetentionPurgeService } from "./retention-purge.service";

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: DOCUMENTS_QUEUE_NAME })],
  controllers: [DocumentsController],
  providers: [DocumentsService, RetentionPurgeService],
  exports: [DocumentsService, RetentionPurgeService],
})
export class DocumentsModule {}
