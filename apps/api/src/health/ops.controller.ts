import { Controller, Get, Inject, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import type { PrismaClient } from "@opero/database";
import { AI_QUEUE, DIAGNOSTICS_QUEUE, DOCUMENTS_QUEUE, REPORTS_QUEUE } from "@opero/shared";
import type { Queue } from "bullmq";
import { Redis } from "ioredis";
import {
  resolveAppEnv,
  resolveEnableApiDocs,
  type ApiEnv,
} from "../config/env";
import { PRISMA_CLIENT } from "../database/database.constants";

type QueueDepths = {
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
};

async function queueDepths(queue: Queue | undefined): Promise<QueueDepths | { error: string }> {
  if (!queue) return { error: "unavailable" };
  try {
    const [waiting, active, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);
    return { waiting, active, failed, delayed };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "queue_probe_failed" };
  }
}

/**
 * Staging-verifiable ops snapshot: non-secret config + dependency probes + queue depths.
 * Does not expose secrets, keys, or customer data. Alert recipients are not configured here.
 */
@Controller("ops")
export class OpsController {
  constructor(
    private readonly config: ConfigService<ApiEnv, true>,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Optional() @InjectQueue(DOCUMENTS_QUEUE) private readonly documentsQueue?: Queue,
    @Optional() @InjectQueue(DIAGNOSTICS_QUEUE) private readonly diagnosticsQueue?: Queue,
    @Optional() @InjectQueue(AI_QUEUE) private readonly aiQueue?: Queue,
    @Optional() @InjectQueue(REPORTS_QUEUE) private readonly reportsQueue?: Queue,
  ) {}

  private version(): string | undefined {
    return (
      this.config.get("APP_VERSION", { infer: true }) ??
      process.env.RAILWAY_GIT_COMMIT_SHA ??
      process.env.npm_package_version
    );
  }

  @Get("status")
  async getStatus() {
    const appEnv = resolveAppEnv({
      APP_ENV: this.config.get("APP_ENV", { infer: true }),
      NODE_ENV: this.config.get("NODE_ENV", { infer: true }),
    });

    const checks: Record<string, "ok" | "fail"> = {
      database: "fail",
      redis: "fail",
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
      checks.redis = (await redis.ping()) === "PONG" ? "ok" : "fail";
    } catch {
      checks.redis = "fail";
    } finally {
      redis.disconnect();
    }

    const queues = {
      documents: await queueDepths(this.documentsQueue),
      diagnostics: await queueDepths(this.diagnosticsQueue),
      ai: await queueDepths(this.aiQueue),
      reports: await queueDepths(this.reportsQueue),
    };

    return {
      status: checks.database === "ok" && checks.redis === "ok" ? "ok" : "degraded",
      service: "api",
      timestamp: new Date().toISOString(),
      version: this.version(),
      appEnv,
      paymentProvider: this.config.get("PAYMENT_PROVIDER", { infer: true }),
      apiDocsEnabled: resolveEnableApiDocs({
        APP_ENV: this.config.get("APP_ENV", { infer: true }),
        NODE_ENV: this.config.get("NODE_ENV", { infer: true }),
        ENABLE_API_DOCS: this.config.get("ENABLE_API_DOCS", { infer: true }),
      }),
      pilot: {
        mode: this.config.get("PILOT_MODE", { infer: true }),
        publicRegistrationEnabled: this.config.get("PUBLIC_REGISTRATION_ENABLED", { infer: true }),
        inviteCodeConfigured: Boolean(this.config.get("PILOT_INVITE_CODE", { infer: true })),
        maxOrganizations: this.config.get("PILOT_MAX_ORGANIZATIONS", { infer: true }) ?? null,
        maxUsers: this.config.get("PILOT_MAX_USERS", { infer: true }) ?? null,
      },
      emergency: {
        disableCheckout: this.config.get("EMERGENCY_DISABLE_CHECKOUT", { infer: true }),
        disableUploads: this.config.get("EMERGENCY_DISABLE_UPLOADS", { infer: true }),
      },
      checks,
      queues,
      alertNote:
        "External notification recipients are not configured in-app. Wire Railway/uptime monitors to owner-approved contacts only.",
    };
  }
}
