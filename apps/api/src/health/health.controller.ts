import { Controller, Get, HttpException, HttpStatus, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PrismaClient } from "@opero/database";
import {
  createHealthResponse,
  readinessResponseSchema,
  type HealthResponse,
  type ReadinessResponse,
} from "@opero/shared";
import { Redis } from "ioredis";
import type { ApiEnv } from "../config/env";
import { PRISMA_CLIENT } from "../database/database.constants";
import { OBJECT_STORAGE } from "../storage/storage.constants";
import type { ObjectStoragePort } from "@opero/object-storage";

@Controller()
export class HealthController {
  constructor(
    private readonly config: ConfigService<ApiEnv, true>,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  private version(): string | undefined {
    return (
      this.config.get("APP_VERSION", { infer: true }) ??
      process.env.RAILWAY_GIT_COMMIT_SHA ??
      process.env.npm_package_version
    );
  }

  @Get("health")
  getHealth(): HealthResponse {
    return createHealthResponse("api", new Date(), this.version());
  }

  /**
   * Readiness: database, Redis, and a storage head/list-safe probe.
   * Used by orchestrators after deploy; does not expose secrets.
   */
  @Get("ready")
  async getReady(): Promise<ReadinessResponse> {
    const checks: Record<string, "ok" | "fail" | "skip"> = {
      database: "fail",
      redis: "fail",
      storage: "skip",
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = "ok";
    } catch {
      checks.database = "fail";
    }

    const redis = new Redis({
      host: this.config.get("REDIS_HOST", { infer: true }),
      port: this.config.get("REDIS_PORT", { infer: true }),
      password: this.config.get("REDIS_PASSWORD", { infer: true }),
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 2000,
    });
    try {
      await redis.connect();
      const pong = await redis.ping();
      checks.redis = pong === "PONG" ? "ok" : "fail";
    } catch {
      checks.redis = "fail";
    } finally {
      redis.disconnect();
    }

    const driver = this.config.get("DOCUMENT_STORAGE_DRIVER", { infer: true });
    if (driver === "memory") {
      checks.storage = "ok";
    } else {
      try {
        const bucket = this.config.get("S3_DOCUMENTS_BUCKET", { infer: true });
        // head of a non-existent key should fail with not-found, not with auth/network.
        await this.storage.headObject({
          bucket,
          key: `__opero_ready_probe_${Date.now()}`,
        });
        checks.storage = "ok";
      } catch (error) {
        const message = String(error);
        // NotFound / NoSuchKey means credentials + network work.
        if (/NoSuchKey|NotFound|Object not found|ENOENT/i.test(message)) {
          checks.storage = "ok";
        } else {
          checks.storage = "fail";
        }
      }
    }

    const status = checks.database === "ok" && checks.redis === "ok" && checks.storage !== "fail"
      ? "ready"
      : "not_ready";

    const body = readinessResponseSchema.parse({
      status,
      service: "api",
      timestamp: new Date().toISOString(),
      version: this.version(),
      checks,
    });

    if (status !== "ready") {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }
}
