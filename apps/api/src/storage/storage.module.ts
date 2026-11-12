import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ClamAvScanner,
  FilesystemObjectStorage,
  MemoryObjectStorage,
  MockMalwareScanner,
  ObjectStoragePort,
  S3ObjectStorage,
  ensureBuckets,
  resolveStorageRoot,
  type MalwareScannerPort,
} from "@opero/object-storage";
import type { ApiEnv } from "../config/env";
import { MALWARE_SCANNER, OBJECT_STORAGE } from "./storage.constants";

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: async (config: ConfigService<ApiEnv, true>): Promise<ObjectStoragePort> => {
        const driver = config.get("DOCUMENT_STORAGE_DRIVER", { infer: true });
        if (driver === "memory") {
          return new MemoryObjectStorage();
        }
        if (driver === "s3") {
          const storage = new S3ObjectStorage({
            endpoint: config.get("S3_ENDPOINT", { infer: true })!,
            region: config.get("S3_REGION", { infer: true }),
            accessKeyId: config.get("S3_ACCESS_KEY_ID", { infer: true })!,
            secretAccessKey: config.get("S3_SECRET_ACCESS_KEY", { infer: true })!,
            forcePathStyle: config.get("S3_FORCE_PATH_STYLE", { infer: true }),
          });
          await ensureBuckets({
            clientConfig: {
              endpoint: config.get("S3_ENDPOINT", { infer: true }),
              region: config.get("S3_REGION", { infer: true }),
              forcePathStyle: config.get("S3_FORCE_PATH_STYLE", { infer: true }),
              credentials: {
                accessKeyId: config.get("S3_ACCESS_KEY_ID", { infer: true })!,
                secretAccessKey: config.get("S3_SECRET_ACCESS_KEY", { infer: true })!,
              },
            },
            buckets: [
              config.get("S3_QUARANTINE_BUCKET", { infer: true }),
              config.get("S3_DOCUMENTS_BUCKET", { infer: true }),
            ],
          });
          return storage;
        }
        return new FilesystemObjectStorage(
          resolveStorageRoot(config.get("DOCUMENT_STORAGE_ROOT", { infer: true })),
        );
      },
    },
    {
      provide: MALWARE_SCANNER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnv, true>): MalwareScannerPort => {
        if (config.get("DOCUMENT_SCANNER_DRIVER", { infer: true }) === "mock") {
          return new MockMalwareScanner("CLEAN");
        }
        return new ClamAvScanner(
          config.get("CLAMAV_HOST", { infer: true }),
          config.get("CLAMAV_PORT", { infer: true }),
        );
      },
    },
  ],
  exports: [OBJECT_STORAGE, MALWARE_SCANNER],
})
export class StorageModule {}
