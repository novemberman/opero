import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PrismaClient } from "@opero/database";
import type { SyntheticEntitlementCode } from "@opero/shared";
import { AuditService } from "../audit/audit.service";
import type { ApiEnv } from "../config/env";
import { PRISMA_CLIENT } from "../database/database.constants";
import { timingSafeStringEqual } from "../security/timing-safe-equal";
import {
  evaluateSyntheticEntitlementGate,
  resolveSyntheticEntitlementAllowlist,
  SYNTHETIC_ENTITLEMENT_CODES,
  syntheticEntitlementSourceId,
} from "./synthetic-entitlement-gate";

@Injectable()
export class SyntheticEntitlementService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly config: ConfigService<ApiEnv, true>,
    private readonly audit: AuditService,
  ) {}

  private headerValue(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string {
    const raw = headers[name] ?? headers[name.toLowerCase()];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return (value ?? "").trim();
  }

  private assertOpsToken(headers: Record<string, string | string[] | undefined>): void {
    const expected = this.config.get("OPS_STATUS_TOKEN", { infer: true });
    if (!expected) {
      throw new ServiceUnavailableException({
        message: "OPS_STATUS_TOKEN must be configured for synthetic entitlement ops",
        code: "OPS_TOKEN_NOT_CONFIGURED",
      });
    }
    const headerToken = this.headerValue(headers, "x-ops-token");
    const authValue = this.headerValue(headers, "authorization");
    const bearer =
      authValue.toLowerCase().startsWith("bearer ") ? authValue.slice(7).trim() : "";
    const provided = headerToken || bearer;
    if (!provided || !timingSafeStringEqual(provided, expected)) {
      throw new UnauthorizedException({
        message: "Ops status token required",
        code: "OPS_STATUS_UNAUTHORIZED",
      });
    }
  }

  /**
   * Second operator secret — independent of OPS_STATUS_TOKEN and of any
   * organization OWNER session. Equivalent strong control to step-up reauth.
   */
  private assertConfirmationToken(
    headers: Record<string, string | string[] | undefined>,
  ): void {
    const expected = this.config.get("SYNTHETIC_ENTITLEMENT_CONFIRMATION_TOKEN", {
      infer: true,
    });
    if (!expected) {
      throw new ServiceUnavailableException({
        message: "SYNTHETIC_ENTITLEMENT_CONFIRMATION_TOKEN must be configured",
        code: "SYNTHETIC_CONFIRMATION_NOT_CONFIGURED",
      });
    }
    const provided = this.headerValue(headers, "x-synthetic-entitlement-confirmation");
    if (!provided || !timingSafeStringEqual(provided, expected)) {
      throw new UnauthorizedException({
        message: "Synthetic entitlement confirmation token required",
        code: "SYNTHETIC_CONFIRMATION_UNAUTHORIZED",
      });
    }
  }

  private assertDualOperatorSecrets(
    headers: Record<string, string | string[] | undefined>,
  ): void {
    this.assertOpsToken(headers);
    this.assertConfirmationToken(headers);
  }

  /** Issuance requires feature flag + window + allowlist. */
  private assertIssuanceAuthorized(
    headers: Record<string, string | string[] | undefined>,
  ): string[] {
    this.assertDualOperatorSecrets(headers);
    const gate = evaluateSyntheticEntitlementGate({
      enabled: this.config.get("SYNTHETIC_ENTITLEMENT_ENABLED", { infer: true }),
      orgIdsRaw: this.config.get("SYNTHETIC_ENTITLEMENT_ORG_IDS", { infer: true }),
      expiresAt: this.config.get("SYNTHETIC_ENTITLEMENT_EXPIRES_AT", { infer: true }),
    });
    if (!gate.ok) {
      throw new ForbiddenException({
        message: gate.message,
        code: gate.code,
      });
    }
    return gate.allowlistedOrgIds;
  }

  /**
   * Revocation remains available during issuance shutdown (flag off / window closed)
   * as long as dual secrets and org allowlist remain configured.
   */
  private assertRevocationAuthorized(
    headers: Record<string, string | string[] | undefined>,
  ): string[] {
    this.assertDualOperatorSecrets(headers);
    const allowlist = resolveSyntheticEntitlementAllowlist(
      this.config.get("SYNTHETIC_ENTITLEMENT_ORG_IDS", { infer: true }),
    );
    if (!allowlist.ok) {
      throw new ForbiddenException({
        message: allowlist.message,
        code: allowlist.code,
      });
    }
    return allowlist.allowlistedOrgIds;
  }

  private assertAllowlistedOrg(organizationId: string, allowlisted: string[]): void {
    if (!allowlisted.includes(organizationId)) {
      throw new ForbiddenException({
        message: "Organization is not allowlisted for synthetic entitlement grants",
        code: "SYNTHETIC_ENTITLEMENT_ORG_FORBIDDEN",
      });
    }
  }

  statusSnapshot() {
    const enabled = this.config.get("SYNTHETIC_ENTITLEMENT_ENABLED", { infer: true });
    const gate = evaluateSyntheticEntitlementGate({
      enabled,
      orgIdsRaw: this.config.get("SYNTHETIC_ENTITLEMENT_ORG_IDS", { infer: true }),
      expiresAt: this.config.get("SYNTHETIC_ENTITLEMENT_EXPIRES_AT", { infer: true }),
    });
    const allowlist = resolveSyntheticEntitlementAllowlist(
      this.config.get("SYNTHETIC_ENTITLEMENT_ORG_IDS", { infer: true }),
    );
    return {
      enabled,
      windowOpen: gate.ok,
      issuanceOpen: gate.ok,
      revocationAvailable: allowlist.ok,
      allowlistedOrgCount: allowlist.ok ? allowlist.allowlistedOrgIds.length : 0,
      expiresAt: this.config.get("SYNTHETIC_ENTITLEMENT_EXPIRES_AT", { infer: true }) ?? null,
      defaultTtlHours: this.config.get("SYNTHETIC_ENTITLEMENT_DEFAULT_TTL_HOURS", {
        infer: true,
      }),
      capabilities: [...SYNTHETIC_ENTITLEMENT_CODES],
    };
  }

  async issue(input: {
    organizationId: string;
    reportId: string;
    code: SyntheticEntitlementCode;
    acceptanceReference: string;
    reason: string;
    createdByLabel: string;
    ttlHours?: number;
    headers: Record<string, string | string[] | undefined>;
    requestId?: string;
  }) {
    const allowlisted = this.assertIssuanceAuthorized(input.headers);
    this.assertAllowlistedOrg(input.organizationId, allowlisted);
    const code = input.code;

    const report = await this.prisma.xRayReport.findFirst({
      where: { id: input.reportId, organizationId: input.organizationId },
      select: { id: true, status: true, publishedAt: true },
    });
    if (!report) {
      throw new NotFoundException({
        message: "Report not found for organization",
        code: "REPORT_NOT_FOUND",
      });
    }

    const defaultTtl = this.config.get("SYNTHETIC_ENTITLEMENT_DEFAULT_TTL_HOURS", {
      infer: true,
    });
    const ttlHours = input.ttlHours ?? defaultTtl;
    if (ttlHours < 1 || ttlHours > 24) {
      throw new ForbiddenException({
        message: "Synthetic entitlement TTL must be between 1 and 24 hours",
        code: "SYNTHETIC_ENTITLEMENT_TTL_INVALID",
      });
    }

    const sourceId = syntheticEntitlementSourceId(
      input.organizationId,
      input.reportId,
      code,
    );
    const now = new Date();
    const validUntil = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

    const otherActive = await this.prisma.entitlementGrant.findFirst({
      where: {
        organizationId: input.organizationId,
        code,
        scopeType: "REPORT",
        scopeId: input.reportId,
        sourceType: "MANUAL",
        revokedAt: null,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        NOT: { sourceId },
      },
      select: { id: true, sourceId: true },
    });
    if (otherActive) {
      throw new ConflictException({
        message: `An active manual ${code} grant already exists for this report`,
        code: "SYNTHETIC_ENTITLEMENT_DUPLICATE_ACTIVE",
        existingSourceId: otherActive.sourceId,
      });
    }

    const existing = await this.prisma.entitlementGrant.findUnique({
      where: {
        organizationId_code_scopeType_scopeId_sourceId: {
          organizationId: input.organizationId,
          code,
          scopeType: "REPORT",
          scopeId: input.reportId,
          sourceId,
        },
      },
    });

    const activeExisting =
      existing &&
      existing.revokedAt == null &&
      existing.validFrom <= now &&
      (existing.validUntil == null || existing.validUntil > now);

    if (activeExisting && existing) {
      await this.audit.record({
        action: "billing.synthetic_entitlement_grant_idempotent",
        entityType: "entitlement_grant",
        entityId: existing.id,
        organizationId: input.organizationId,
        requestId: input.requestId,
        metadata: {
          test: true,
          provenance: "synthetic_test",
          sourceType: "MANUAL",
          sourceId,
          code,
          reportId: input.reportId,
          validUntil: existing.validUntil?.toISOString() ?? null,
          acceptanceReference: input.acceptanceReference.trim(),
          reason: input.reason.trim(),
          createdByLabel: input.createdByLabel.trim(),
          idempotent: true,
        },
      });
      return {
        grant: this.toPublicGrant(existing),
        idempotent: true as const,
        policy: this.accessPolicyNote(code),
      };
    }

    const grant = await this.prisma.entitlementGrant.upsert({
      where: {
        organizationId_code_scopeType_scopeId_sourceId: {
          organizationId: input.organizationId,
          code,
          scopeType: "REPORT",
          scopeId: input.reportId,
          sourceId,
        },
      },
      create: {
        organizationId: input.organizationId,
        code,
        scopeType: "REPORT",
        scopeId: input.reportId,
        sourceType: "MANUAL",
        sourceId,
        validFrom: now,
        validUntil,
      },
      update: {
        revokedAt: null,
        revokeReason: null,
        validFrom: now,
        validUntil,
      },
    });

    await this.audit.record({
      action: "billing.synthetic_entitlement_granted",
      entityType: "entitlement_grant",
      entityId: grant.id,
      organizationId: input.organizationId,
      requestId: input.requestId,
      metadata: {
        test: true,
        provenance: "synthetic_test",
        sourceType: "MANUAL",
        sourceId,
        code,
        reportId: input.reportId,
        reportStatus: report.status,
        validFrom: grant.validFrom.toISOString(),
        validUntil: grant.validUntil?.toISOString() ?? null,
        ttlHours,
        acceptanceReference: input.acceptanceReference.trim(),
        reason: input.reason.trim(),
        createdByLabel: input.createdByLabel.trim(),
        paymentFabricated: false,
        scopesIssued: [code],
        scopesNotIssued: [
          ...SYNTHETIC_ENTITLEMENT_CODES.filter((c) => c !== code),
          "xray.full_report",
        ] as const,
      },
    });

    return {
      grant: this.toPublicGrant(grant),
      idempotent: false as const,
      policy: this.accessPolicyNote(code),
    };
  }

  async revoke(input: {
    organizationId: string;
    reportId: string;
    code: SyntheticEntitlementCode;
    reason: string;
    createdByLabel: string;
    headers: Record<string, string | string[] | undefined>;
    requestId?: string;
  }) {
    const allowlisted = this.assertRevocationAuthorized(input.headers);
    this.assertAllowlistedOrg(input.organizationId, allowlisted);
    const code = input.code;

    const sourceId = syntheticEntitlementSourceId(
      input.organizationId,
      input.reportId,
      code,
    );
    const existing = await this.prisma.entitlementGrant.findUnique({
      where: {
        organizationId_code_scopeType_scopeId_sourceId: {
          organizationId: input.organizationId,
          code,
          scopeType: "REPORT",
          scopeId: input.reportId,
          sourceId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException({
        message: "Synthetic entitlement grant not found",
        code: "SYNTHETIC_ENTITLEMENT_NOT_FOUND",
      });
    }

    if (existing.revokedAt != null) {
      await this.audit.record({
        action: "billing.synthetic_entitlement_revoke_idempotent",
        entityType: "entitlement_grant",
        entityId: existing.id,
        organizationId: input.organizationId,
        requestId: input.requestId,
        metadata: {
          test: true,
          provenance: "synthetic_test",
          sourceId,
          code,
          reportId: input.reportId,
          revokedAt: existing.revokedAt.toISOString(),
          reason: input.reason.trim(),
          createdByLabel: input.createdByLabel.trim(),
          idempotent: true,
          issuanceDisabled:
            !this.config.get("SYNTHETIC_ENTITLEMENT_ENABLED", { infer: true }),
        },
      });
      return {
        grant: this.toPublicGrant(existing),
        idempotent: true as const,
        policy: this.accessPolicyNote(code),
      };
    }

    const revokedAt = new Date();
    const grant = await this.prisma.entitlementGrant.update({
      where: { id: existing.id },
      data: {
        revokedAt,
        revokeReason: `synthetic_revoked:${input.reason.trim().slice(0, 200)}`,
      },
    });

    const published = await this.prisma.xRayReport.findFirst({
      where: { id: input.reportId, organizationId: input.organizationId },
      select: { status: true, publishedAt: true },
    });

    await this.audit.record({
      action: "billing.synthetic_entitlement_revoked",
      entityType: "entitlement_grant",
      entityId: grant.id,
      organizationId: input.organizationId,
      requestId: input.requestId,
      metadata: {
        test: true,
        provenance: "synthetic_test",
        sourceType: "MANUAL",
        sourceId,
        code,
        reportId: input.reportId,
        revokedAt: revokedAt.toISOString(),
        reason: input.reason.trim(),
        createdByLabel: input.createdByLabel.trim(),
        reportStatus: published?.status ?? null,
        publishedAt: published?.publishedAt?.toISOString() ?? null,
        historicalReportPreserved: true,
        issuanceDisabled:
          !this.config.get("SYNTHETIC_ENTITLEMENT_ENABLED", { infer: true }),
        pdfRecallLimitation:
          "Previously downloaded PDF files cannot be remotely recalled; only subsequent entitlement checks are affected.",
      },
    });

    return {
      grant: this.toPublicGrant(grant),
      idempotent: false as const,
      policy: this.accessPolicyNote(code),
    };
  }

  private toPublicGrant(grant: {
    id: string;
    organizationId: string;
    code: string;
    scopeType: string;
    scopeId: string;
    sourceType: string;
    sourceId: string;
    validFrom: Date;
    validUntil: Date | null;
    revokedAt: Date | null;
    revokeReason: string | null;
    createdAt: Date;
  }) {
    return {
      id: grant.id,
      organizationId: grant.organizationId,
      code: grant.code,
      scopeType: grant.scopeType,
      scopeId: grant.scopeId,
      sourceType: grant.sourceType,
      sourceId: grant.sourceId,
      validFrom: grant.validFrom.toISOString(),
      validUntil: grant.validUntil?.toISOString() ?? null,
      revokedAt: grant.revokedAt?.toISOString() ?? null,
      revokeReason: grant.revokeReason,
      createdAt: grant.createdAt.toISOString(),
    };
  }

  private accessPolicyNote(code: SyntheticEntitlementCode) {
    return {
      capabilityIssued: code,
      independentCapabilities: [...SYNTHETIC_ENTITLEMENT_CODES],
      publish:
        code === "xray.report_generate"
          ? "Allowed while this grant is active (ordinary xray:publish + canGenerateReport)."
          : "Unaffected by pdf_download grant; requires xray.report_generate.",
      pdfGeneration:
        "Occurs during successful publish when xray.report_generate is active; object stored privately under org prefix.",
      pdfDownload:
        code === "xray.pdf_download"
          ? "Allowed while this grant is active (ordinary canDownloadPdf)."
          : "Requires a separate xray.pdf_download grant; not implied by report_generate.",
      fullReportView:
        "Published full content still requires xray.full_report (never issued by synthetic grants).",
      afterRevocation:
        "Subsequent hasEntitlement for this code is false (live DB check; no entitlement cache). Historical PUBLISHED rows and audits are preserved.",
      revocationDuringIssuanceShutdown:
        "Revoke remains available with dual operator secrets + org allowlist even when SYNTHETIC_ENTITLEMENT_ENABLED=false.",
    };
  }
}
