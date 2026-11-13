import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@opero/database";
import {
  assessReadiness,
  type ReadinessInputDocument,
  type ReadinessResult,
} from "@opero/diagnostics";
import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/database.constants";
import {
  ReconciliationService,
  type ReconciliationScope,
} from "../reconciliation/reconciliation.service";
import type { AuthenticatedUser } from "../types/express";

@Injectable()
export class ReadinessService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly reconciliation: ReconciliationService,
    private readonly audit: AuditService,
  ) {}

  async assess(input: {
    organizationId: string;
    actor: AuthenticatedUser;
    documentIds: string[];
    diagnosticRunId?: string;
    requestId?: string;
  }) {
    const documentIds = [...new Set(input.documentIds)].sort();

    let runStatus: string | null = null;
    if (input.diagnosticRunId) {
      const run = await this.prisma.diagnosticRun.findFirst({
        where: { id: input.diagnosticRunId, organizationId: input.organizationId },
        select: { status: true },
      });
      if (!run) throw new NotFoundException("Diagnostic run not found");
      runStatus = run.status;
    }

    const documents = await this.prisma.document.findMany({
      where: { organizationId: input.organizationId, id: { in: documentIds } },
      select: {
        id: true,
        processingStatus: true,
        scanStatus: true,
        deletionStatus: true,
        extractions: {
          where: { status: { in: ["SUCCEEDED", "MANUAL_REQUIRED"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            statements: {
              select: {
                currency: true,
                periodStart: true,
                periodEnd: true,
                periodLabel: true,
                periodType: true,
                consolidationScope: true,
                confirmedAt: true,
                lineItems: { select: { currency: true, reviewStatus: true } },
              },
            },
          },
        },
      },
    });
    if (documents.length !== documentIds.length) {
      throw new BadRequestException("One or more documents are not in this organization");
    }

    // Record conflicts in the evidence being assessed before counting them, so
    // an assessment cannot pass merely because detection was never run.
    let scope: ReconciliationScope;
    if (input.diagnosticRunId) {
      scope = { diagnosticRunId: input.diagnosticRunId };
      if (runStatus === "SUCCEEDED") {
        await this.reconciliation.syncForRun(input.organizationId, input.diagnosticRunId);
      }
    } else {
      scope = { documentIds };
      if (documentIds.length > 0) {
        await this.reconciliation.syncForDocuments(
          input.organizationId,
          documentIds,
          input.actor.id,
        );
      }
    }
    const open = await this.reconciliation.countOpen(input.organizationId, scope);

    const result = assessReadiness({
      documents: documents.map((document): ReadinessInputDocument => {
        const statements = document.extractions[0]?.statements ?? [];
        const lineItems = statements.flatMap((statement) => statement.lineItems);
        return {
          id: document.id,
          processingStatus: document.processingStatus,
          scanStatus: document.scanStatus,
          deletionStatus: document.deletionStatus,
          statementCount: statements.length,
          lineItemCount: lineItems.length,
          pendingReviewCount: lineItems.filter((item) => item.reviewStatus === "PENDING").length,
          hasCurrency:
            statements.length > 0 &&
            statements.every(
              (statement) =>
                Boolean(statement.currency) ||
                (statement.lineItems.length > 0 &&
                  statement.lineItems.every((item) => Boolean(item.currency))),
            ),
          hasPeriod:
            statements.length > 0 &&
            statements.every(
              (statement) =>
                Boolean(statement.periodStart && statement.periodEnd) ||
                Boolean(statement.periodLabel),
            ),
          periodType: statements.some((statement) => statement.periodType === "UNKNOWN")
            ? "UNKNOWN"
            : (statements[0]?.periodType ?? "UNKNOWN"),
          consolidationScope: statements.some(
            (statement) => statement.consolidationScope === "UNKNOWN",
          )
            ? "UNKNOWN"
            : (statements[0]?.consolidationScope ?? "UNKNOWN"),
          metadataConfirmed:
            statements.length > 0 &&
            statements.every((statement) => statement.confirmedAt !== null),
        };
      }),
      openCriticalReconciliations: open.critical,
      openHighReconciliations: open.high,
    });

    const assessment = await this.prisma.diagnosticReadinessAssessment.create({
      data: {
        organizationId: input.organizationId,
        diagnosticRunId: input.diagnosticRunId ?? null,
        documentIds,
        status: result.status,
        checklist: toJson(result.checklist),
        issues: toJson(result.issues),
        blockingReasons: toJson(result.blockingReasons),
      },
    });

    await this.audit.record({
      action: "readiness.assessed",
      entityType: "diagnostic_readiness_assessment",
      entityId: assessment.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: {
        status: result.status,
        documentIds,
        diagnosticRunId: input.diagnosticRunId ?? null,
      },
    });

    return { assessment, result };
  }

  async latest(
    organizationId: string,
    filter: { diagnosticRunId?: string; documentIds?: string[] },
  ) {
    return this.prisma.diagnosticReadinessAssessment.findFirst({
      where: {
        organizationId,
        ...(filter.diagnosticRunId ? { diagnosticRunId: filter.diagnosticRunId } : {}),
        ...(filter.documentIds
          ? { documentIds: { equals: [...new Set(filter.documentIds)].sort() } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }
}

function toJson(value: ReadinessResult[keyof ReadinessResult]): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}
