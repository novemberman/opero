import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaClient } from "@opero/database";
import type { AuditService } from "../audit/audit.service";

export type PublicationRequestedAction =
  | "approve"
  | "publish"
  | "reject"
  | "submit_review"
  | "render";

export type PublicationFailureClass =
  | "GROUNDING"
  | "STATE"
  | "PERMISSION"
  | "READINESS"
  | "RECONCILIATION"
  | "INTEGRITY"
  | "APPROVAL"
  | "OTHER";

/** Dedup window: identical denials from the same actor are not re-written. */
export const PUBLICATION_DENIAL_DEDUP_MS = 30_000;

export type PublicationDenialInput = {
  organizationId: string;
  actorUserId: string;
  reportId: string;
  versionId?: string | null;
  requestedAction: PublicationRequestedAction;
  requestId?: string | null;
  failureCode: string;
  failureClass: PublicationFailureClass;
  /** Short safe classifier detail — never narratives, documents, or credentials. */
  detail?: string;
};

const GROUNDING_CODES = new Set(["CRITICAL_GROUNDING_VIOLATIONS"]);
const READINESS_CODES = new Set(["READINESS_BLOCKED"]);
const RECON_CODES = new Set(["CRITICAL_RECONCILIATIONS_OPEN"]);
const APPROVAL_CODES = new Set(["APPROVAL_NOT_RECORDED"]);
const INTEGRITY_CODES = new Set([
  "PUBLISHED_ARTIFACT_EXISTS",
  "PUBLISHED_PDF_MISSING",
  "PUBLISHED_PDF_CORRUPT",
  "PUBLISHED_PDF_IMMUTABLE",
  "PUBLISHED_PDF_MISSING_METADATA",
]);

export function classifyPublicationFailure(code: string): PublicationFailureClass {
  if (GROUNDING_CODES.has(code)) return "GROUNDING";
  if (READINESS_CODES.has(code)) return "READINESS";
  if (RECON_CODES.has(code)) return "RECONCILIATION";
  if (APPROVAL_CODES.has(code)) return "APPROVAL";
  if (INTEGRITY_CODES.has(code)) return "INTEGRITY";
  if (code === "MISSING_PERMISSION" || code === "NOT_A_MEMBER") return "PERMISSION";
  if (
    code === "INVALID_STATE" ||
    code === "ALREADY_PUBLISHED" ||
    code === "CONFLICT" ||
    code.startsWith("STATE_")
  ) {
    return "STATE";
  }
  return "OTHER";
}

export function extractHttpFailureCode(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === "object" && response !== null && "code" in response) {
      const code = (response as { code?: unknown }).code;
      if (typeof code === "string" && code.length > 0) return code;
    }
    if (error instanceof ConflictException) {
      const message = error.message;
      if (/already published/i.test(message)) return "ALREADY_PUBLISHED";
      if (/expected |only an APPROVED|is DRAFT|is REVIEW/i.test(message)) return "INVALID_STATE";
      return "CONFLICT";
    }
    if (error instanceof ForbiddenException) return "MISSING_PERMISSION";
  }
  return "OTHER";
}

/**
 * Writes `report.publication_denied` outside any failed business transaction.
 * Skips when an identical denial was recorded for the same actor/report/action/code
 * within the dedup window.
 */
export async function recordPublicationDenial(
  prisma: PrismaClient,
  audit: AuditService,
  input: PublicationDenialInput,
): Promise<boolean> {
  const since = new Date(Date.now() - PUBLICATION_DENIAL_DEDUP_MS);
  const recent = await prisma.auditEvent.findFirst({
    where: {
      action: "report.publication_denied",
      organizationId: input.organizationId,
      entityId: input.reportId,
      actorUserId: input.actorUserId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  const recentMeta = (recent?.metadata ?? null) as {
    requestedAction?: string;
    failureCode?: string;
  } | null;
  if (
    recentMeta?.requestedAction === input.requestedAction &&
    recentMeta?.failureCode === input.failureCode
  ) {
    return false;
  }

  await audit.record({
    action: "report.publication_denied",
    entityType: "xray_report",
    entityId: input.reportId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    requestId: input.requestId ?? null,
    metadata: {
      versionId: input.versionId ?? null,
      requestedAction: input.requestedAction,
      failureCode: input.failureCode,
      failureClass: input.failureClass,
      ...(input.detail ? { detail: input.detail.slice(0, 200) } : {}),
    },
  });
  return true;
}

/** Records a denial then rethrows. Never swallows the original error. */
export async function denyPublicationAndThrow(
  prisma: PrismaClient,
  audit: AuditService,
  input: Omit<PublicationDenialInput, "failureCode" | "failureClass"> & {
    error: unknown;
    failureCode?: string;
    failureClass?: PublicationFailureClass;
  },
): Promise<never> {
  // Missing reports stay plain 404s — do not inflate cross-tenant probes into
  // publication denials (membership refusals already cover foreign orgs).
  if (!(input.error instanceof NotFoundException)) {
    const failureCode = input.failureCode ?? extractHttpFailureCode(input.error);
    const failureClass = input.failureClass ?? classifyPublicationFailure(failureCode);
    try {
      await recordPublicationDenial(prisma, audit, {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        reportId: input.reportId,
        versionId: input.versionId,
        requestedAction: input.requestedAction,
        requestId: input.requestId,
        failureCode,
        failureClass,
        detail: input.error instanceof Error ? input.error.message.slice(0, 200) : undefined,
      });
    } catch {
      // Audit failure must not mask the original denial.
    }
  }
  throw input.error;
}
