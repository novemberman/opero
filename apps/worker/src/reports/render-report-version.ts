import type { PrismaClient } from "@opero/database";
import type { ObjectStoragePort } from "@opero/object-storage";
import { createHash } from "node:crypto";

export type ReportRenderJob = {
  organizationId: string;
  reportId: string;
  reportVersionId: string;
  actorUserId: string;
  correlationId?: string;
};

export type ReportRenderOutcome = "SKIPPED" | "INTEGRITY_FAILURE";

/** Publication decisions written by the API when the version was published. */
type StoredPublication = {
  verifiedPublication?: unknown;
  generatedAt?: unknown;
  additionalDisclosures?: unknown;
};

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Verifies a published PDF artifact. Never regenerates or overwrites.
 * Missing or corrupt objects fail closed with an integrity audit event.
 */
export async function renderReportVersion(
  prisma: PrismaClient,
  storage: ObjectStoragePort,
  bucket: string,
  job: ReportRenderJob,
): Promise<ReportRenderOutcome> {
  const { organizationId, reportId, reportVersionId } = job;

  const version = await prisma.xRayReportVersion.findFirst({
    where: { id: reportVersionId, reportId, organizationId },
  });
  if (!version) throw new Error("Report version not found for tenant context");
  if (version.status !== "PUBLISHED" && version.status !== "SUPERSEDED") {
    return "SKIPPED";
  }

  const publication = version.disclosures as StoredPublication | null;
  if (!publication || typeof publication.generatedAt !== "string") {
    throw new Error("Published report version has no publication record");
  }
  if (!version.contentHash || !version.storageKey) {
    await prisma.auditEvent.create({
      data: {
        organizationId,
        actorUserId: job.actorUserId,
        action: "report.pdf_integrity_failed",
        entityType: "xray_report",
        entityId: reportId,
        requestId: job.correlationId ?? null,
        metadata: {
          versionId: version.id,
          reason: "MISSING_METADATA",
        },
      },
    });
    return "INTEGRITY_FAILURE";
  }

  const key = version.storageKey;
  if (!key.startsWith(`org/${organizationId}/reports/${reportId}/`)) {
    throw new Error("Report storage key organization mismatch");
  }

  let existing: Buffer;
  try {
    existing = await storage.getObjectBuffer({ bucket, key });
  } catch {
    await prisma.auditEvent.create({
      data: {
        organizationId,
        actorUserId: job.actorUserId,
        action: "report.pdf_integrity_failed",
        entityType: "xray_report",
        entityId: reportId,
        requestId: job.correlationId ?? null,
        metadata: {
          versionId: version.id,
          reason: "MISSING_OBJECT",
          storageKey: key,
          expectedHash: version.contentHash,
        },
      },
    });
    return "INTEGRITY_FAILURE";
  }

  if (sha256(existing) === version.contentHash) {
    return "SKIPPED";
  }

  await prisma.auditEvent.create({
    data: {
      organizationId,
      actorUserId: job.actorUserId,
      action: "report.pdf_integrity_failed",
      entityType: "xray_report",
      entityId: reportId,
      requestId: job.correlationId ?? null,
      metadata: {
        versionId: version.id,
        reason: "HASH_MISMATCH",
        storageKey: key,
        expectedHash: version.contentHash,
        actualHash: sha256(existing),
      },
    },
  });
  return "INTEGRITY_FAILURE";
}
