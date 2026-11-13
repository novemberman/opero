import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import type {
  Prisma,
  PrismaClient,
  ReportApprovalAction,
  XRayReportStatus,
  XRayReportVersion,
} from "@opero/database";
import {
  ObjectAlreadyExistsError,
  type ObjectStoragePort,
} from "@opero/object-storage";
import { DEFAULT_REPORT_TITLE, renderReportPdf } from "@opero/reports";
import type { Queue } from "bullmq";
import { createHash } from "node:crypto";
import { narrativeText } from "../ai/narrative";
import { AuditService } from "../audit/audit.service";
import type { ApiEnv } from "../config/env";
import { PRISMA_CLIENT } from "../database/database.constants";
import { ReadinessService } from "../readiness/readiness.service";
import { ReconciliationService } from "../reconciliation/reconciliation.service";
import { OBJECT_STORAGE } from "../storage/storage.constants";
import type { AuthenticatedUser } from "../types/express";
import {
  assertNoCriticalGrounding,
  claimsFromAiVersion,
} from "./grounding-gate";
import { denyPublicationAndThrow } from "./publication-audit";
import {
  additionalDisclosures,
  buildReportModel,
  canBeVerified,
  reportStorageKey,
  type ReportPublication,
  type StoredReportAiNarrative,
  type StoredReportPayload,
} from "./report-payload";
import { REPORTS_QUEUE_NAME } from "./reports.queue";

type WorkflowInput = {
  organizationId: string;
  reportId: string;
  actor: AuthenticatedUser;
  note?: string;
  requestId?: string;
};

const VERSION_SUMMARY = {
  id: true,
  versionNumber: true,
  status: true,
  aiInterpretationVersionId: true,
  storageKey: true,
  contentHash: true,
  byteSize: true,
  disclosures: true,
  createdByUserId: true,
  createdAt: true,
} satisfies Prisma.XRayReportVersionSelect;

function toDateString(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function payloadOf(version: Pick<XRayReportVersion, "snapshotPayload">): StoredReportPayload {
  return version.snapshotPayload as unknown as StoredReportPayload;
}

/** The publication record exists only on versions that have been published. */
function publicationOf(
  version: Pick<XRayReportVersion, "status" | "disclosures">,
): ReportPublication | null {
  if (version.status !== "PUBLISHED" && version.status !== "SUPERSEDED") return null;
  const publication = version.disclosures as ReportPublication | null;
  return publication && typeof publication.generatedAt === "string" ? publication : null;
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @InjectQueue(REPORTS_QUEUE_NAME) private readonly queue: Queue,
    private readonly readiness: ReadinessService,
    private readonly reconciliation: ReconciliationService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<ApiEnv, true>,
  ) {}

  private bucket(): string {
    return this.config.get("S3_DOCUMENTS_BUCKET", { infer: true });
  }

  async create(input: {
    organizationId: string;
    actor: AuthenticatedUser;
    diagnosticRunId: string;
    title?: string;
    aiInterpretationVersionId?: string;
    requestId?: string;
  }) {
    const title = input.title ?? DEFAULT_REPORT_TITLE;
    const payload = await this.buildPayload({
      organizationId: input.organizationId,
      actor: input.actor,
      diagnosticRunId: input.diagnosticRunId,
      title,
      aiInterpretationVersionId: input.aiInterpretationVersionId ?? null,
      requestId: input.requestId,
    });

    const report = await this.prisma.$transaction(async (tx) => {
      const created = await tx.xRayReport.create({
        data: {
          organizationId: input.organizationId,
          diagnosticRunId: input.diagnosticRunId,
          createdByUserId: input.actor.id,
          status: "DRAFT",
          title,
        },
      });
      const version = await tx.xRayReportVersion.create({
        data: {
          organizationId: input.organizationId,
          reportId: created.id,
          versionNumber: 1,
          status: "DRAFT",
          snapshotPayload: payload as unknown as Prisma.InputJsonValue,
          aiInterpretationVersionId: payload.aiNarrative?.aiInterpretationVersionId ?? null,
          createdByUserId: input.actor.id,
        },
      });
      return tx.xRayReport.update({
        where: { id: created.id },
        data: { currentVersionId: version.id },
      });
    });

    await this.audit.record({
      action: "report.created",
      entityType: "xray_report",
      entityId: report.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: {
        diagnosticRunId: input.diagnosticRunId,
        scoreStatus: payload.score.status,
        readinessStatus: payload.readinessStatus,
        aiInterpretationVersionId: payload.aiNarrative?.aiInterpretationVersionId ?? null,
      },
    });

    return this.getDetail(input.organizationId, report.id);
  }

  /**
   * Adds a new draft version. A published version is never edited: it stays
   * downloadable and is marked SUPERSEDED once a newer version is published.
   */
  async createVersion(input: {
    organizationId: string;
    reportId: string;
    actor: AuthenticatedUser;
    title?: string;
    /** `undefined` keeps the current attachment, `null` removes it. */
    aiInterpretationVersionId?: string | null;
    requestId?: string;
  }) {
    const report = await this.loadReport(input.organizationId, input.reportId);
    if (report.status === "REVIEW_REQUIRED" || report.status === "APPROVED") {
      throw new ConflictException(
        `Report is ${report.status}; reject it before creating a new version`,
      );
    }
    const previous = report.currentVersion;
    const title = input.title ?? report.title;
    const payload = await this.buildPayload({
      organizationId: input.organizationId,
      actor: input.actor,
      diagnosticRunId: report.diagnosticRunId,
      title,
      aiInterpretationVersionId:
        input.aiInterpretationVersionId === undefined
          ? previous.aiInterpretationVersionId
          : input.aiInterpretationVersionId,
      requestId: input.requestId,
    });

    const version = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.xRayReport.updateMany({
        where: {
          id: report.id,
          organizationId: input.organizationId,
          status: report.status,
          currentVersionId: previous.id,
        },
        data: { status: "DRAFT", title, currentVersionId: null },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("Report changed while creating a new version");
      }
      const latest = await tx.xRayReportVersion.findFirst({
        where: { reportId: report.id },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      const created = await tx.xRayReportVersion.create({
        data: {
          organizationId: input.organizationId,
          reportId: report.id,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          status: "DRAFT",
          snapshotPayload: payload as unknown as Prisma.InputJsonValue,
          aiInterpretationVersionId: payload.aiNarrative?.aiInterpretationVersionId ?? null,
          createdByUserId: input.actor.id,
        },
      });
      await tx.xRayReport.update({
        where: { id: report.id },
        data: { currentVersionId: created.id },
      });
      if (previous.status !== "PUBLISHED") {
        // An unpublished draft is replaced outright.
        await tx.xRayReportVersion.update({
          where: { id: previous.id },
          data: { status: "SUPERSEDED" },
        });
        await tx.reportApproval.create({
          data: {
            organizationId: input.organizationId,
            reportId: report.id,
            reportVersionId: previous.id,
            actorUserId: input.actor.id,
            action: "SUPERSEDE",
          },
        });
      }
      return created;
    });

    await this.audit.record({
      action: "report.version_created",
      entityType: "xray_report",
      entityId: report.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: { versionId: version.id, versionNumber: version.versionNumber },
    });

    return this.getDetail(input.organizationId, report.id);
  }

  async list(organizationId: string) {
    return this.prisma.xRayReport.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        status: true,
        verifiedPublication: true,
        publishedAt: true,
        diagnosticRunId: true,
        createdAt: true,
        updatedAt: true,
        currentVersion: {
          select: { id: true, versionNumber: true, status: true, aiInterpretationVersionId: true },
        },
      },
    });
  }

  async getDetail(
    organizationId: string,
    reportId: string,
    viewer?: { actor: AuthenticatedUser; requestId?: string },
  ) {
    const report = await this.prisma.xRayReport.findFirst({
      where: { id: reportId, organizationId },
      include: {
        currentVersion: true,
        versions: { orderBy: { versionNumber: "desc" }, select: VERSION_SUMMARY },
        approvals: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            action: true,
            note: true,
            createdAt: true,
            reportVersionId: true,
            actor: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!report) throw new NotFoundException("Report not found");

    if (viewer) {
      await this.prisma.reportAccessEvent.create({
        data: {
          organizationId,
          reportId: report.id,
          reportVersionId: report.currentVersionId,
          actorUserId: viewer.actor.id,
          action: "VIEW",
          requestId: viewer.requestId,
        },
      });
    }

    const { currentVersion, ...summary } = report;
    const preview = currentVersion
      ? buildReportModel(payloadOf(currentVersion), publicationOf(currentVersion))
      : null;
    return { report: summary, preview };
  }

  async listVersions(organizationId: string, reportId: string) {
    await this.requireReport(organizationId, reportId);
    return this.prisma.xRayReportVersion.findMany({
      where: { organizationId, reportId },
      orderBy: { versionNumber: "desc" },
      select: VERSION_SUMMARY,
    });
  }

  async getVersion(organizationId: string, reportId: string, versionId: string) {
    const version = await this.prisma.xRayReportVersion.findFirst({
      where: { id: versionId, reportId, organizationId },
    });
    if (!version) throw new NotFoundException("Report version not found");
    return {
      version,
      preview: buildReportModel(payloadOf(version), publicationOf(version)),
    };
  }

  async submitForReview(input: WorkflowInput) {
    try {
      return await this.transition(input, {
        from: ["DRAFT"],
        to: "REVIEW_REQUIRED",
        action: "SUBMIT_REVIEW",
        auditAction: "report.submitted_for_review",
      });
    } catch (error) {
      await denyPublicationAndThrow(this.prisma, this.audit, {
        organizationId: input.organizationId,
        actorUserId: input.actor.id,
        reportId: input.reportId,
        requestedAction: "submit_review",
        requestId: input.requestId,
        error,
      });
    }
  }

  async approve(input: WorkflowInput) {
    let versionId: string | null = null;
    try {
      const report = await this.loadReport(input.organizationId, input.reportId);
      versionId = report.currentVersion.id;
      // Re-validate the exact frozen narrative; human approval cannot override
      // unresolved critical grounding violations.
      const groundingValidation = assertNoCriticalGrounding(
        payloadOf(report.currentVersion),
        "approve",
      );
      const detail = await this.transition(input, {
        from: ["REVIEW_REQUIRED"],
        to: "APPROVED",
        action: "APPROVE",
        auditAction: "report.approved",
      });
      if (groundingValidation) {
        await this.prisma.xRayReportVersion.update({
          where: { id: report.currentVersion.id },
          data: {
            disclosures: {
              ...((report.currentVersion.disclosures as object | null) ?? {}),
              groundingValidation,
            } as Prisma.InputJsonValue,
          },
        });
        await this.audit.record({
          action: "report.grounding_validated",
          entityType: "xray_report",
          entityId: report.id,
          organizationId: input.organizationId,
          actorUserId: input.actor.id,
          requestId: input.requestId,
          metadata: {
            versionId: report.currentVersion.id,
            stage: "approve",
            groundingVersion: groundingValidation.version,
            passed: groundingValidation.passed,
            criticalCount: groundingValidation.criticalCount,
          },
        });
      }
      return detail;
    } catch (error) {
      await denyPublicationAndThrow(this.prisma, this.audit, {
        organizationId: input.organizationId,
        actorUserId: input.actor.id,
        reportId: input.reportId,
        versionId,
        requestedAction: "approve",
        requestId: input.requestId,
        error,
      });
    }
  }

  async reject(input: WorkflowInput) {
    try {
      return await this.transition(input, {
        from: ["REVIEW_REQUIRED", "APPROVED"],
        to: "REJECTED",
        action: "REJECT",
        auditAction: "report.rejected",
      });
    } catch (error) {
      await denyPublicationAndThrow(this.prisma, this.audit, {
        organizationId: input.organizationId,
        actorUserId: input.actor.id,
        reportId: input.reportId,
        requestedAction: "reject",
        requestId: input.requestId,
        error,
      });
    }
  }

  async publish(input: WorkflowInput) {
    let versionId: string | null = null;
    try {
      return await this.publishInner(input, (id) => {
        versionId = id;
      });
    } catch (error) {
      await denyPublicationAndThrow(this.prisma, this.audit, {
        organizationId: input.organizationId,
        actorUserId: input.actor.id,
        reportId: input.reportId,
        versionId,
        requestedAction: "publish",
        requestId: input.requestId,
        error,
      });
    }
  }

  private async publishInner(
    input: WorkflowInput,
    onVersion: (versionId: string) => void,
  ) {
    const report = await this.loadReport(input.organizationId, input.reportId);
    onVersion(report.currentVersion.id);
    if (report.status === "PUBLISHED") {
      throw new ConflictException({
        message: "Report is already published and immutable; create a new version to change it",
        code: "ALREADY_PUBLISHED",
      });
    }
    if (report.status !== "APPROVED") {
      throw new ConflictException({
        message: `Report is ${report.status}; only an APPROVED report can be published`,
        code: "INVALID_STATE",
      });
    }
    const version = report.currentVersion;
    const payload = payloadOf(version);

    // The report status alone is not proof of approval. The version being
    // published must itself be APPROVED and carry its own recorded decision;
    // an approval of an earlier version does not carry over.
    const decisions = await this.prisma.reportApproval.findMany({
      where: {
        organizationId: input.organizationId,
        reportId: report.id,
        reportVersionId: version.id,
        action: { in: ["APPROVE", "REJECT"] },
      },
      select: { action: true },
    });
    if (
      version.status !== "APPROVED" ||
      !decisions.some((decision) => decision.action === "APPROVE") ||
      decisions.some((decision) => decision.action === "REJECT")
    ) {
      throw new ConflictException({
        message:
          "No approval is recorded for the current report version; reject it and submit a new version for review",
        code: "APPROVAL_NOT_RECORDED",
      });
    }

    const run = await this.prisma.diagnosticRun.findFirst({
      where: { id: report.diagnosticRunId, organizationId: input.organizationId },
      select: { id: true, status: true, snapshot: { select: { documentIds: true } } },
    });
    if (!run || run.status !== "SUCCEEDED") {
      throw new ConflictException({
        message: "The diagnostic run behind this report has not SUCCEEDED",
        code: "INVALID_STATE",
      });
    }

    // Gates are evaluated again at publication; the draft may be old.
    const { result } = await this.readiness.assess({
      organizationId: input.organizationId,
      actor: input.actor,
      documentIds: run.snapshot?.documentIds ?? [],
      diagnosticRunId: run.id,
      requestId: input.requestId,
    });
    const open = await this.reconciliation.countOpen(input.organizationId, {
      diagnosticRunId: run.id,
    });
    if (open.critical > 0) {
      throw new ConflictException({
        message: `${open.critical} critical evidence conflict(s) must be resolved before publishing`,
        code: "CRITICAL_RECONCILIATIONS_OPEN",
        openCritical: open.critical,
      });
    }
    if (result.status === "BLOCKED") {
      throw new ConflictException({
        message: "Diagnostic readiness is BLOCKED; the report cannot be published",
        code: "READINESS_BLOCKED",
        blockingReasons: result.blockingReasons,
      });
    }

    // Final narrative must pass critical grounding again at publish time.
    const groundingValidation = assertNoCriticalGrounding(payload, "publish");

    // Without a produced score the report is published limitations-forward only.
    const verifiedPublication = canBeVerified(payload);
    const publishedAt = new Date();
    const extraDisclosures = additionalDisclosures(payload, {
      status: result.status,
      issues: result.issues.map(({ code, severity, title }) => ({ code, severity, title })),
    });
    const model = buildReportModel(payload, {
      verifiedPublication,
      generatedAt: publishedAt.toISOString(),
      additionalDisclosures: extraDisclosures,
    });
    const pdf = await renderReportPdf(model);
    const contentHash = createHash("sha256").update(pdf).digest("hex");
    const storageKey = reportStorageKey(input.organizationId, report.id, version.id);
    const publication: ReportPublication = {
      verifiedPublication,
      generatedAt: publishedAt.toISOString(),
      additionalDisclosures: extraDisclosures,
      rendered: model.disclosures,
      groundingValidation,
    };

    await this.prisma.$transaction(
      async (tx) => {
        // Claiming the row first serializes concurrent publishers, so only the
        // winner writes the object.
        const claimed = await tx.xRayReport.updateMany({
          where: {
            id: report.id,
            organizationId: input.organizationId,
            status: "APPROVED",
            currentVersionId: version.id,
          },
          data: { status: "PUBLISHED", verifiedPublication, publishedAt },
        });
        if (claimed.count !== 1) {
          throw new ConflictException("Report changed while publishing");
        }

        try {
          await this.storage.putObject({
            bucket: this.bucket(),
            key: storageKey,
            body: pdf,
            contentType: "application/pdf",
            overwrite: false,
          });
        } catch (error) {
          if (error instanceof ObjectAlreadyExistsError) {
            throw new ConflictException({
              message: "A published PDF already exists for this version and cannot be overwritten",
              code: "PUBLISHED_ARTIFACT_EXISTS",
            });
          }
          throw error;
        }

        const earlier = await tx.xRayReportVersion.findMany({
          where: {
            reportId: report.id,
            organizationId: input.organizationId,
            status: "PUBLISHED",
            id: { not: version.id },
          },
          select: { id: true },
        });
        for (const superseded of earlier) {
          await tx.xRayReportVersion.update({
            where: { id: superseded.id },
            data: { status: "SUPERSEDED" },
          });
          await tx.reportApproval.create({
            data: {
              organizationId: input.organizationId,
              reportId: report.id,
              reportVersionId: superseded.id,
              actorUserId: input.actor.id,
              action: "SUPERSEDE",
            },
          });
        }

        await tx.xRayReportVersion.update({
          where: { id: version.id },
          data: {
            status: "PUBLISHED",
            storageKey,
            contentHash,
            byteSize: pdf.length,
            disclosures: publication as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.reportApproval.create({
          data: {
            organizationId: input.organizationId,
            reportId: report.id,
            reportVersionId: version.id,
            actorUserId: input.actor.id,
            action: "PUBLISH",
            note: input.note ?? null,
          },
        });
      },
      { timeout: 30_000 },
    );

    await this.audit.record({
      action: "report.published",
      entityType: "xray_report",
      entityId: report.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: {
        versionId: version.id,
        verifiedPublication,
        scoreStatus: payload.score.status,
        readinessStatus: result.status,
        contentHash,
        byteSize: pdf.length,
        groundingVersion: groundingValidation?.version ?? null,
        groundingPassed: groundingValidation?.passed ?? null,
      },
    });

    return this.getDetail(input.organizationId, report.id);
  }

  async authorizeDownload(input: {
    organizationId: string;
    reportId: string;
    versionId?: string;
    actor: AuthenticatedUser;
    requestId?: string;
  }) {
    await this.requireReport(input.organizationId, input.reportId);
    const version = await this.prisma.xRayReportVersion.findFirst({
      where: {
        organizationId: input.organizationId,
        reportId: input.reportId,
        ...(input.versionId
          ? { id: input.versionId, status: { in: ["PUBLISHED", "SUPERSEDED"] } }
          : { status: "PUBLISHED" }),
      },
      orderBy: { versionNumber: "desc" },
    });
    if (!version || !version.storageKey || !version.contentHash) {
      throw new ConflictException({
        message: "This report has no published PDF",
        code: "PUBLISHED_PDF_MISSING_METADATA",
      });
    }
    if (!version.storageKey.startsWith(`org/${input.organizationId}/reports/${input.reportId}/`)) {
      throw new ForbiddenException("Invalid storage key for organization");
    }

    let buffer: Buffer;
    try {
      buffer = await this.storage.getObjectBuffer({
        bucket: this.bucket(),
        key: version.storageKey,
      });
    } catch {
      await this.audit.record({
        action: "report.pdf_integrity_failed",
        entityType: "xray_report",
        entityId: input.reportId,
        organizationId: input.organizationId,
        actorUserId: input.actor.id,
        requestId: input.requestId,
        metadata: {
          versionId: version.id,
          reason: "MISSING_OBJECT",
          storageKey: version.storageKey,
          expectedHash: version.contentHash,
        },
      });
      throw new ConflictException({
        message:
          "Published PDF is missing from storage; create a new report version to publish a replacement",
        code: "PUBLISHED_PDF_MISSING",
      });
    }
    const actualHash = createHash("sha256").update(buffer).digest("hex");
    if (actualHash !== version.contentHash) {
      await this.audit.record({
        action: "report.pdf_integrity_failed",
        entityType: "xray_report",
        entityId: input.reportId,
        organizationId: input.organizationId,
        actorUserId: input.actor.id,
        requestId: input.requestId,
        metadata: {
          versionId: version.id,
          reason: "HASH_MISMATCH",
          storageKey: version.storageKey,
          expectedHash: version.contentHash,
          actualHash,
        },
      });
      throw new ConflictException({
        message: "Published PDF failed integrity validation and will not be delivered",
        code: "PUBLISHED_PDF_CORRUPT",
      });
    }

    await this.prisma.reportAccessEvent.create({
      data: {
        organizationId: input.organizationId,
        reportId: input.reportId,
        reportVersionId: version.id,
        actorUserId: input.actor.id,
        action: "DOWNLOAD",
        requestId: input.requestId,
      },
    });
    await this.audit.record({
      action: "report.downloaded",
      entityType: "xray_report",
      entityId: input.reportId,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: { versionId: version.id, contentHash: version.contentHash },
    });

    return { buffer, filename: `opero-xray-report-v${version.versionNumber}.pdf` };
  }

  /**
   * Regeneration of a published PDF is forbidden. Corrections require a new
   * report version and a fresh publish.
   */
  async requestRender(input: {
    organizationId: string;
    reportId: string;
    versionId: string;
    actor: AuthenticatedUser;
    requestId?: string;
  }) {
    const version = await this.prisma.xRayReportVersion.findFirst({
      where: { id: input.versionId, reportId: input.reportId, organizationId: input.organizationId },
      select: { id: true, status: true, disclosures: true, contentHash: true },
    });
    if (!version) throw new NotFoundException("Report version not found");
    if (!publicationOf(version)) {
      throw new ConflictException("Only published report versions have PDF artifacts");
    }

    await this.audit.record({
      action: "report.pdf_regenerate_rejected",
      entityType: "xray_report",
      entityId: input.reportId,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: { versionId: version.id, contentHash: version.contentHash },
    });
    throw new ConflictException({
      message:
        "Published PDFs are immutable; create and publish a new report version instead of regenerating",
      code: "PUBLISHED_PDF_IMMUTABLE",
    });
  }

  private async transition(
    input: WorkflowInput,
    step: {
      from: XRayReportStatus[];
      to: XRayReportStatus;
      action: ReportApprovalAction;
      auditAction: string;
    },
  ) {
    const report = await this.loadReport(input.organizationId, input.reportId);
    if (report.status === "PUBLISHED") {
      throw new ConflictException({
        message: "Report is already published and immutable; create a new version to change it",
        code: "ALREADY_PUBLISHED",
      });
    }
    if (!step.from.includes(report.status)) {
      throw new ConflictException({
        message: `Report is ${report.status}; expected ${step.from.join(" or ")}`,
        code: "INVALID_STATE",
      });
    }
    const version = report.currentVersion;

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.xRayReport.updateMany({
        where: {
          id: report.id,
          organizationId: input.organizationId,
          status: report.status,
          currentVersionId: version.id,
        },
        data: { status: step.to },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("Report changed while updating its status");
      }
      await tx.xRayReportVersion.update({
        where: { id: version.id },
        data: { status: step.to },
      });
      await tx.reportApproval.create({
        data: {
          organizationId: input.organizationId,
          reportId: report.id,
          reportVersionId: version.id,
          actorUserId: input.actor.id,
          action: step.action,
          note: input.note ?? null,
        },
      });
    });

    await this.audit.record({
      action: step.auditAction,
      entityType: "xray_report",
      entityId: report.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: { versionId: version.id, from: report.status, to: step.to },
    });

    return this.getDetail(input.organizationId, report.id);
  }

  private async requireReport(organizationId: string, reportId: string) {
    const report = await this.prisma.xRayReport.findFirst({
      where: { id: reportId, organizationId },
      select: { id: true },
    });
    if (!report) throw new NotFoundException("Report not found");
  }

  private async loadReport(organizationId: string, reportId: string) {
    const report = await this.prisma.xRayReport.findFirst({
      where: { id: reportId, organizationId },
      include: { currentVersion: true },
    });
    if (!report) throw new NotFoundException("Report not found");
    const { currentVersion } = report;
    if (!currentVersion) throw new ConflictException("Report has no current version");
    return { ...report, currentVersion };
  }

  /**
   * Assembles a version's frozen content from a SUCCEEDED run's stored
   * results. Refuses when readiness is BLOCKED.
   */
  private async buildPayload(input: {
    organizationId: string;
    actor: AuthenticatedUser;
    diagnosticRunId: string;
    title: string;
    aiInterpretationVersionId: string | null;
    requestId?: string;
  }): Promise<StoredReportPayload> {
    const { organizationId } = input;
    const run = await this.prisma.diagnosticRun.findFirst({
      where: { id: input.diagnosticRunId, organizationId },
      include: {
        organization: { select: { name: true } },
        snapshot: { select: { contentHash: true, documentIds: true } },
        quality: true,
        score: true,
      },
    });
    if (!run) throw new NotFoundException("Diagnostic run not found");
    if (run.status !== "SUCCEEDED") {
      throw new ConflictException("A report requires a diagnostic run that has SUCCEEDED");
    }
    if (!run.quality || !run.score) {
      throw new ConflictException("The diagnostic run has no quality or score results");
    }

    const { assessment, result } = await this.readiness.assess({
      organizationId,
      actor: input.actor,
      documentIds: run.snapshot?.documentIds ?? [],
      diagnosticRunId: run.id,
      requestId: input.requestId,
    });
    if (result.status === "BLOCKED") {
      throw new ConflictException({
        message: "Diagnostic readiness is BLOCKED; a report cannot be created",
        code: "READINESS_BLOCKED",
        blockingReasons: result.blockingReasons,
      });
    }

    const aiNarrative = input.aiInterpretationVersionId
      ? await this.loadAiNarrative(organizationId, run.id, input.aiInterpretationVersionId)
      : null;

    const where = { organizationId, diagnosticRunId: run.id };
    const [metrics, findings] = await Promise.all([
      this.prisma.financialMetric.findMany({
        where,
        orderBy: [{ dimension: "asc" }, { code: "asc" }],
        select: {
          code: true,
          label: true,
          dimension: true,
          status: true,
          value: true,
          unit: true,
          periodLabel: true,
        },
      }),
      this.prisma.diagnosticFinding.findMany({
        where,
        orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          category: true,
          severity: true,
          title: true,
          explanation: true,
          implication: true,
          suggestedAction: true,
        },
      }),
    ]);

    return {
      schemaVersion: 1,
      title: input.title,
      diagnosticRunId: run.id,
      snapshotContentHash: run.snapshot?.contentHash ?? null,
      engineVersions: {
        calculationEngine: run.calculationEngineVersion,
        ruleSet: run.ruleSetVersion,
        scoreMethodology: run.scoreMethodologyVersion,
      },
      organizationName: run.organization.name,
      periodLabel: run.periodLabel,
      periodStart: toDateString(run.periodStart),
      periodEnd: toDateString(run.periodEnd),
      currency: run.currency,
      metrics,
      findings,
      quality: {
        completeness: run.quality.completeness,
        consistency: run.quality.consistency,
        evidenceReliability: run.quality.evidenceReliability,
        diagnosticCoverage: run.quality.diagnosticCoverage,
      },
      score: {
        status: run.score.status,
        overallScore: run.score.overallScore,
        methodologyVersion: run.score.methodologyVersion,
        limitations: stringList(run.score.limitations),
      },
      readinessStatus: result.status,
      readiness: {
        assessmentId: assessment.id,
        issues: result.issues.map(({ code, severity, title }) => ({ code, severity, title })),
      },
      aiNarrative,
    };
  }

  private async loadAiNarrative(
    organizationId: string,
    diagnosticRunId: string,
    aiInterpretationVersionId: string,
  ): Promise<StoredReportAiNarrative> {
    const version = await this.prisma.aIInterpretationVersion.findFirst({
      where: {
        id: aiInterpretationVersionId,
        organizationId,
        interpretationRun: { organizationId, diagnosticRunId, status: "SUCCEEDED" },
      },
      include: { interpretationRun: { select: { provider: true, model: true } } },
    });
    if (!version) {
      throw new BadRequestException(
        "AI interpretation version not found for this diagnostic run",
      );
    }
    const sourceNarrative = version.editedNarrative ?? version.narrative;
    const narrative = narrativeText(sourceNarrative);
    if (!narrative.summary) {
      throw new BadRequestException("AI interpretation version has no summary to attach");
    }
    // Prefer claims from the edited narrative when present; otherwise the original.
    const claims = claimsFromAiVersion(sourceNarrative);
    const originalClaims = claimsFromAiVersion(version.narrative);
    return {
      aiInterpretationVersionId: version.id,
      isSimulated: version.isSimulated,
      narrative,
      provider: version.interpretationRun.provider,
      model: version.interpretationRun.model,
      humanEdited: version.editedNarrative !== null,
      unsupportedClaimCount: Array.isArray(version.unsupportedClaims)
        ? version.unsupportedClaims.length
        : 0,
      claims: claims.length > 0 ? claims : originalClaims,
    };
  }
}
