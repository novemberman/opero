import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { FinancialConcept, Prisma, PrismaClient } from "@opero/database";
import {
  buildSnapshot,
  detectEvidenceConflicts,
  type DiagnosticSnapshot,
  type EvidenceConflict,
  type RawSnapshotLine,
  type SnapshotLineItem,
} from "@opero/diagnostics";
import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/database.constants";
import type { AuthenticatedUser } from "../types/express";

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
const STALE_REASON = "Conflict no longer detected in the current evidence";

export type ReconciliationScope =
  | { diagnosticRunId: string }
  | { documentIds: string[] };

@Injectable()
export class ReconciliationService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  /** Detects conflicts for a scope, persists them, and returns the open ones. */
  async detect(input: {
    organizationId: string;
    actor: AuthenticatedUser;
    scope: ReconciliationScope;
    requestId?: string;
  }) {
    const summary =
      "diagnosticRunId" in input.scope
        ? await this.syncForRun(input.organizationId, input.scope.diagnosticRunId)
        : await this.syncForDocuments(
            input.organizationId,
            input.scope.documentIds,
            input.actor.id,
          );

    await this.audit.record({
      action: "reconciliation.detected",
      entityType: "evidence_reconciliation",
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: { scope: input.scope, ...summary },
    });

    const reconciliations = await this.prisma.evidenceReconciliation.findMany({
      where: {
        organizationId: input.organizationId,
        status: "OPEN",
        ...this.scopeFilter(input.scope),
      },
      include: { items: true },
      orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
    });
    return { ...summary, reconciliations };
  }

  /**
   * Persists conflicts found in a completed run's immutable input snapshot.
   * Idempotent: existing rows (and their resolutions) are left untouched.
   */
  async syncForRun(organizationId: string, diagnosticRunId: string) {
    const run = await this.prisma.diagnosticRun.findFirst({
      where: { id: diagnosticRunId, organizationId },
      include: { snapshot: true },
    });
    if (!run) throw new NotFoundException("Diagnostic run not found");
    if (run.status !== "SUCCEEDED" || !run.snapshot) {
      throw new ConflictException(
        "Evidence conflicts can only be detected for a SUCCEEDED diagnostic run",
      );
    }

    const payload = run.snapshot.payload as { lines?: unknown; warnings?: unknown } | null;
    const lines = Array.isArray(payload?.lines) ? (payload.lines as SnapshotLineItem[]) : [];
    const snapshot: DiagnosticSnapshot = {
      contentHash: run.snapshot.contentHash,
      currency: run.currency,
      periodStart: toDateString(run.periodStart),
      periodEnd: toDateString(run.periodEnd),
      periodLabel: run.periodLabel,
      documentIds: run.snapshot.documentIds,
      extractionIds: run.snapshot.extractionIds,
      lines,
      warnings: [],
    };
    const conflicts = detectEvidenceConflicts(snapshot);
    const created = await this.persist(organizationId, diagnosticRunId, conflicts);
    return { detected: conflicts.length, created, closedStale: 0 };
  }

  /**
   * Persists conflicts found in the current evidence of the given documents.
   * Open document-scoped conflicts that are no longer detected are closed.
   */
  async syncForDocuments(organizationId: string, documentIds: string[], actorUserId: string) {
    const uniqueIds = [...new Set(documentIds)];
    const documents = await this.prisma.document.findMany({
      where: { organizationId, id: { in: uniqueIds } },
      include: {
        extractions: {
          where: { status: { in: ["SUCCEEDED", "MANUAL_REQUIRED"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            statements: { include: { lineItems: { include: { evidence: true } } } },
          },
        },
      },
    });
    if (documents.length !== uniqueIds.length) {
      throw new BadRequestException("One or more documents are not in this organization");
    }

    const rawLines: RawSnapshotLine[] = [];
    for (const document of documents) {
      if (document.deletionStatus !== "ACTIVE" || document.scanStatus !== "CLEAN") continue;
      const extraction = document.extractions[0];
      if (!extraction) continue;
      for (const statement of extraction.statements) {
        for (const item of statement.lineItems) {
          rawLines.push({
            lineItemId: item.id,
            documentId: document.id,
            extractionId: extraction.id,
            statementId: statement.id,
            concept: item.concept,
            labelRaw: item.labelRaw,
            rawValue: item.rawValue,
            normalizedValue: item.normalizedValue,
            currency: item.currency ?? statement.currency,
            unitScale: item.unitScale,
            quality: item.quality,
            reviewStatus: item.reviewStatus,
            statementType: statement.statementType,
            periodStart: toDateString(statement.periodStart),
            periodEnd: toDateString(statement.periodEnd),
            periodLabel: statement.periodLabel,
            evidenceReferenceId: item.evidenceId,
            evidenceKey: item.evidence?.evidenceKey ?? null,
          });
        }
      }
    }

    const conflicts = detectEvidenceConflicts(buildSnapshot({ lines: rawLines }));
    const created = await this.persist(organizationId, null, conflicts);

    const stale = await this.prisma.evidenceReconciliation.updateMany({
      where: {
        organizationId,
        diagnosticRunId: null,
        status: "OPEN",
        conflictKey: { notIn: conflicts.map((conflict) => conflict.conflictKey) },
        ...this.scopeFilter({ documentIds: uniqueIds }),
      },
      data: {
        status: "DISMISSED",
        resolution: "DISMISS",
        resolutionReason: STALE_REASON,
        resolvedByUserId: actorUserId,
        resolvedAt: new Date(),
      },
    });
    return { detected: conflicts.length, created, closedStale: stale.count };
  }

  async countOpen(organizationId: string, scope: ReconciliationScope) {
    const where = { organizationId, status: "OPEN" as const, ...this.scopeFilter(scope) };
    const [critical, high] = await Promise.all([
      this.prisma.evidenceReconciliation.count({ where: { ...where, severity: "CRITICAL" } }),
      this.prisma.evidenceReconciliation.count({ where: { ...where, severity: "HIGH" } }),
    ]);
    return { critical, high };
  }

  async list(
    organizationId: string,
    filter: { status: "OPEN" | "RESOLVED" | "DISMISSED" | "ALL"; diagnosticRunId?: string },
  ) {
    return this.prisma.evidenceReconciliation.findMany({
      where: {
        organizationId,
        ...(filter.status === "ALL" ? {} : { status: filter.status }),
        ...(filter.diagnosticRunId ? { diagnosticRunId: filter.diagnosticRunId } : {}),
      },
      include: { items: true },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
  }

  async get(organizationId: string, reconciliationId: string) {
    const reconciliation = await this.prisma.evidenceReconciliation.findFirst({
      where: { id: reconciliationId, organizationId },
      include: { items: true },
    });
    if (!reconciliation) throw new NotFoundException("Reconciliation not found");
    return reconciliation;
  }

  async resolve(input: {
    organizationId: string;
    reconciliationId: string;
    actor: AuthenticatedUser;
    resolution: "SELECT_AUTHORITATIVE" | "CORRECT_VALUE" | "DISMISS";
    selectedLineItemId?: string;
    correctedValue?: string;
    reason: string;
    requestId?: string;
  }) {
    const reconciliation = await this.get(input.organizationId, input.reconciliationId);
    if (reconciliation.status !== "OPEN") {
      throw new ConflictException("Reconciliation is already resolved");
    }

    let resolvedValue: string | null = null;
    let authoritativeItemId: string | null = null;

    if (input.resolution === "SELECT_AUTHORITATIVE") {
      if (!input.selectedLineItemId) {
        throw new BadRequestException("selectedLineItemId is required to select a source");
      }
      const item = reconciliation.items.find(
        (candidate) => candidate.lineItemId === input.selectedLineItemId,
      );
      if (!item) {
        throw new BadRequestException("selectedLineItemId is not a candidate of this conflict");
      }
      authoritativeItemId = item.id;
      resolvedValue = item.value;
    } else if (input.resolution === "CORRECT_VALUE") {
      if (!input.correctedValue) {
        throw new BadRequestException("correctedValue is required for corrections");
      }
      if (!DECIMAL_PATTERN.test(input.correctedValue)) {
        throw new BadRequestException("correctedValue must be a plain decimal number");
      }
      resolvedValue = input.correctedValue;
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.evidenceReconciliation.updateMany({
        where: { id: reconciliation.id, organizationId: input.organizationId, status: "OPEN" },
        data: {
          status: input.resolution === "DISMISS" ? "DISMISSED" : "RESOLVED",
          resolution: input.resolution,
          resolvedValue,
          resolvedByUserId: input.actor.id,
          resolutionReason: input.reason,
          resolvedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("Reconciliation is already resolved");
      }
      if (authoritativeItemId) {
        await tx.evidenceReconciliationItem.update({
          where: { id: authoritativeItemId },
          data: { isAuthoritative: true },
        });
      }
    });

    await this.audit.record({
      action: "reconciliation.resolved",
      entityType: "evidence_reconciliation",
      entityId: reconciliation.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: {
        resolution: input.resolution,
        severity: reconciliation.severity,
        conflictKey: reconciliation.conflictKey,
      },
    });

    return this.get(input.organizationId, reconciliation.id);
  }

  private scopeFilter(scope: ReconciliationScope): Prisma.EvidenceReconciliationWhereInput {
    if ("diagnosticRunId" in scope) return { diagnosticRunId: scope.diagnosticRunId };
    // Only conflicts that lie entirely within the selected documents.
    return {
      diagnosticRunId: null,
      AND: [
        { items: { some: { documentId: { in: scope.documentIds } } } },
        { items: { every: { documentId: { in: scope.documentIds } } } },
      ],
    };
  }

  /**
   * Inserts conflicts that are not yet recorded for the scope. An existing
   * row keeps its status, so a resolution is never reopened or overwritten.
   */
  private async persist(
    organizationId: string,
    diagnosticRunId: string | null,
    conflicts: EvidenceConflict[],
  ): Promise<number> {
    if (conflicts.length === 0) return 0;
    return this.prisma.$transaction(async (tx) => {
      // The unique index does not cover rows without a run (NULL is distinct in
      // Postgres), so serialize detection per organization instead.
      const lockKey = `reconciliation:${organizationId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existing = await tx.evidenceReconciliation.findMany({
        where: {
          organizationId,
          diagnosticRunId,
          conflictKey: { in: conflicts.map((conflict) => conflict.conflictKey) },
        },
        select: { conflictKey: true },
      });
      const known = new Set(existing.map((row) => row.conflictKey));

      let created = 0;
      for (const conflict of conflicts) {
        if (known.has(conflict.conflictKey)) continue;
        await tx.evidenceReconciliation.create({
          data: {
            organizationId,
            diagnosticRunId,
            conflictKey: conflict.conflictKey,
            concept: conflict.concept as FinancialConcept,
            severity: conflict.severity,
            title: conflict.title,
            explanation: conflict.explanation,
            candidates: conflict.candidates as unknown as Prisma.InputJsonValue,
            items: {
              create: conflict.candidates.map((candidate) => ({
                organizationId,
                documentId: candidate.documentId,
                lineItemId: candidate.lineItemId,
                label: candidate.label,
                value: candidate.value,
                currency: candidate.currency,
                periodLabel: candidate.periodLabel,
              })),
            },
          },
        });
        created += 1;
      }
      return created;
    });
  }
}

function toDateString(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
