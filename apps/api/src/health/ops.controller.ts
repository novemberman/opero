import {
  Controller,
  Get,
  Headers,
  Inject,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { Throttle } from "@nestjs/throttler";
import type { PrismaClient } from "@opero/database";
import { AI_QUEUE, DIAGNOSTICS_QUEUE, DOCUMENTS_QUEUE, REPORTS_QUEUE } from "@opero/shared";
import type { Queue } from "bullmq";
import {
  resolveAppEnv,
  resolveEnableApiDocs,
  type ApiEnv,
} from "../config/env";
import { PRISMA_CLIENT } from "../database/database.constants";
import { pilotUploadWindowOpen } from "../documents/pilot-upload-gate";
import {
  evaluateSyntheticEntitlementGate,
  resolveSyntheticEntitlementAllowlist,
  SYNTHETIC_ENTITLEMENT_CODES,
} from "../pilot/synthetic-entitlement-gate";
import { timingSafeStringEqual } from "../security/timing-safe-equal";

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
  } catch {
    // Never surface provider/driver error strings to anonymous scrapers.
    return { error: "probe_failed" };
  }
}

/**
 * Staging-verifiable ops snapshot: non-secret config + dependency probes + queue depths.
 * Does not expose secrets, keys, customer data, or raw infrastructure errors.
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

  private assertOpsAuthorized(headers: Record<string, string | string[] | undefined>): void {
    const expected = this.config.get("OPS_STATUS_TOKEN", { infer: true });
    if (!expected) return;

    const rawHeader = headers["x-ops-token"];
    const headerToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const auth = headers.authorization;
    const authValue = Array.isArray(auth) ? auth[0] : auth;
    const bearer =
      typeof authValue === "string" && authValue.toLowerCase().startsWith("bearer ")
        ? authValue.slice(7).trim()
        : undefined;
    const provided = (headerToken?.trim() || bearer || "").trim();
    if (!provided || !timingSafeStringEqual(provided, expected)) {
      throw new UnauthorizedException({
        message: "Ops status token required",
        code: "OPS_STATUS_UNAUTHORIZED",
      });
    }
  }

  /**
   * Probe Redis via BullMQ queue getters (shared connection) instead of opening
   * a new TCP client on every scrape.
   */
  private async probeRedis(): Promise<"ok" | "fail"> {
    const queue = this.documentsQueue ?? this.diagnosticsQueue ?? this.aiQueue ?? this.reportsQueue;
    if (!queue) return "fail";
    try {
      await queue.getWaitingCount();
      return "ok";
    } catch {
      return "fail";
    }
  }

  @Get("status")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async getStatus(
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    this.assertOpsAuthorized(headers);

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

    checks.redis = await this.probeRedis();

    const queues = {
      documents: await queueDepths(this.documentsQueue),
      diagnostics: await queueDepths(this.diagnosticsQueue),
      ai: await queueDepths(this.aiQueue),
      reports: await queueDepths(this.reportsQueue),
    };

    const status = checks.database === "ok" && checks.redis === "ok" ? "ok" : "degraded";

    return {
      status,
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
      pilotUpload: {
        enabled: this.config.get("PILOT_UPLOAD_ENABLED", { infer: true }),
        orgConfigured: Boolean(this.config.get("PILOT_UPLOAD_ORG_ID", { infer: true })),
        expiresAt: this.config.get("PILOT_UPLOAD_EXPIRES_AT", { infer: true }) ?? null,
        windowOpen: pilotUploadWindowOpen({
          emergencyDisableUploads: this.config.get("EMERGENCY_DISABLE_UPLOADS", { infer: true }),
          pilotUploadEnabled: this.config.get("PILOT_UPLOAD_ENABLED", { infer: true }),
          pilotUploadOrgId: this.config.get("PILOT_UPLOAD_ORG_ID", { infer: true }),
          pilotUploadExpiresAt: this.config.get("PILOT_UPLOAD_EXPIRES_AT", { infer: true }),
        }),
      },
      syntheticEntitlement: (() => {
        const enabled = this.config.get("SYNTHETIC_ENTITLEMENT_ENABLED", { infer: true });
        const orgIdsRaw = this.config.get("SYNTHETIC_ENTITLEMENT_ORG_IDS", { infer: true });
        const gate = evaluateSyntheticEntitlementGate({
          enabled,
          orgIdsRaw,
          expiresAt: this.config.get("SYNTHETIC_ENTITLEMENT_EXPIRES_AT", { infer: true }),
        });
        const allowlist = resolveSyntheticEntitlementAllowlist(orgIdsRaw);
        return {
          enabled,
          windowOpen: gate.ok,
          issuanceOpen: gate.ok,
          revocationAvailable: allowlist.ok,
          allowlistedOrgCount: allowlist.ok ? allowlist.allowlistedOrgIds.length : 0,
          expiresAt: this.config.get("SYNTHETIC_ENTITLEMENT_EXPIRES_AT", { infer: true }) ?? null,
          capabilities: [...SYNTHETIC_ENTITLEMENT_CODES],
        };
      })(),
      checks,
      queues,
      alertNote:
        "External notification recipients are not configured in-app. Wire Railway/uptime monitors to owner-approved contacts only.",
    };
  }
}
