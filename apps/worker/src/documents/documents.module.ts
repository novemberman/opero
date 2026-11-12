import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ClamAvScanner,
  FilesystemObjectStorage,
  MemoryObjectStorage,
  MockMalwareScanner,
  ObjectStoragePort,
  S3ObjectStorage,
  resolveStorageRoot,
  type MalwareScannerPort,
} from "@opero/object-storage";
import type { WorkerEnv } from "../config/env";
import { loadDatabaseModule } from "../database/load-database";
import { DocumentProcessProcessor } from "./document-process.processor";
import {
  DOCUMENTS_QUEUE_NAME,
  MALWARE_SCANNER,
  OBJECT_STORAGE,
  PRISMA_CLIENT,
} from "./documents.constants";

@Module({
  imports: [BullModule.registerQueue({ name: DOCUMENTS_QUEUE_NAME })],
  providers: [
    {
      provide: PRISMA_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService<WorkerEnv, true>) => {
        const { createPrismaClient } = await loadDatabaseModule();
        return createPrismaClient(config.get("DATABASE_URL", { infer: true }));
      },
    },
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<WorkerEnv, true>): ObjectStoragePort => {
        const driver = config.get("DOCUMENT_STORAGE_DRIVER", { infer: true });
        if (driver === "memory") {
          return new MemoryObjectStorage();
        }
        if (driver === "s3") {
          return new S3ObjectStorage({
            endpoint: config.get("S3_ENDPOINT", { infer: true })!,
            region: config.get("S3_REGION", { infer: true }),
            accessKeyId: config.get("S3_ACCESS_KEY_ID", { infer: true })!,
            secretAccessKey: config.get("S3_SECRET_ACCESS_KEY", { infer: true })!,
            forcePathStyle: config.get("S3_FORCE_PATH_STYLE", { infer: true }),
          });
        }
        return new FilesystemObjectStorage(
          resolveStorageRoot(config.get("DOCUMENT_STORAGE_ROOT", { infer: true })),
        );
      },
    },
    {
      provide: MALWARE_SCANNER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<WorkerEnv, true>): MalwareScannerPort => {
        if (config.get("DOCUMENT_SCANNER_DRIVER", { infer: true }) === "mock") {
          return new MockMalwareScanner("CLEAN");
        }
        return new ClamAvScanner(
          config.get("CLAMAV_HOST", { infer: true }),
          config.get("CLAMAV_PORT", { infer: true }),
        );
      },
    },
    DocumentProcessProcessor,
  ],
})
export class DocumentsModule {}
