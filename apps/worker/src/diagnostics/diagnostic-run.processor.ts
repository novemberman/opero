import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@opero/database";
import {
  buildSnapshot,
  RULES_V1,
  RULE_SET_ID,
  runDiagnosticEngine,
  type RawSnapshotLine,
} from "@opero/diagnostics";
import type { Job } from "bullmq";
import { assertTenantJobContext } from "../tenant/job-context";
import { DIAGNOSTIC_RUN_JOB, DIAGNOSTICS_QUEUE_NAME, PRISMA_CLIENT } from "./diagnostics.constants";

type DiagnosticJobData = {
  organizationId: string;
  diagnosticRunId: string;
  actorUserId: string;
  correlationId?: string;
};

@Processor(DIAGNOSTICS_QUEUE_NAME)
export class DiagnosticRunProcessor extends WorkerHost {
  private readonly logger = new Logger(DiagnosticRunProcessor.name);

  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<DiagnosticJobData>): Promise<void> {
    if (job.name !== DIAGNOSTIC_RUN_JOB) return;

    assertTenantJobContext(job.data);
    const { organizationId, diagnosticRunId } = job.data;
    if (typeof diagnosticRunId !== "string" || diagnosticRunId.length === 0) {
      throw new Error("Job payload missing diagnosticRunId");
    }

    const run = await this.prisma.diagnosticRun.findFirst({
      where: { id: diagnosticRunId, organizationId },
      include: { snapshot: true },
    });
    if (!run) throw new Error("Diagnostic run not found for tenant context");

    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(run.status)) {
      this.logger.log(`Skipping terminal diagnostic run ${diagnosticRunId} (${run.status})`);
      return;
    }

    await this.prisma.diagnosticRun.update({
      where: { id: run.id },
      data: { status: "RUNNING", startedAt: run.startedAt ?? new Date() },
    });

    try {
      await this.ensureRuleCatalog();
      const requested =
        (run.snapshot?.payload as { requestedDocumentIds?: string[] } | null)
          ?.requestedDocumentIds ??
        run.snapshot?.documentIds ??
        [];

      const documents = await this.prisma.document.findMany({
        where: {
          organizationId,
          id: { in: requested },
          deletionStatus: "ACTIVE",
          scanStatus: "CLEAN",
        },
        include: {
          extractions: {
            where: { status: { in: ["SUCCEEDED", "MANUAL_REQUIRED"] } },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              statements: {
                include: {
                  lineItems: {
                    include: { evidence: true },
                  },
                },
              },
            },
          },
        },
      });

      if (documents.length !== requested.length) {
        throw new Error("Documents missing or not eligible for diagnostics");
      }

      const rawLines: RawSnapshotLine[] = [];
      for (const document of documents) {
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
              periodStart: statement.periodStart
                ? statement.periodStart.toISOString().slice(0, 10)
                : null,
              periodEnd: statement.periodEnd
                ? statement.periodEnd.toISOString().slice(0, 10)
                : null,
              periodLabel: statement.periodLabel,
              evidenceReferenceId: item.evidenceId,
              evidenceKey: item.evidence?.evidenceKey ?? null,
            });
          }
        }
      }

      const pendingPayload = (run.snapshot?.payload ?? {}) as {
        currency?: string | null;
        periodLabel?: string | null;
      };

      const latestEnd = rawLines
        .map((l) => l.periodEnd)
        .filter((v): v is string => Boolean(v))
        .sort()
        .at(-1);
      const latestStart =
        rawLines.find((l) => l.periodEnd === latestEnd)?.periodStart ??
        rawLines.map((l) => l.periodStart).filter((v): v is string => Boolean(v)).sort().at(-1) ??
        null;

      const snapshot = buildSnapshot({
        lines: rawLines,
        currency: run.currency ?? pendingPayload.currency ?? null,
        periodLabel: run.periodLabel ?? pendingPayload.periodLabel ?? null,
        periodStart: latestStart,
        periodEnd: latestEnd ?? null,
      });

      const engine = runDiagnosticEngine(snapshot);

      await this.prisma.$transaction(async (tx) => {
        await tx.diagnosticEvidenceLink.deleteMany({
          where: { finding: { diagnosticRunId: run.id } },
        });
        await tx.diagnosticFinding.deleteMany({ where: { diagnosticRunId: run.id } });
        await tx.scoreComponent.deleteMany({
          where: { scoreRow: { diagnosticRunId: run.id } },
        });
        await tx.diagnosticScore.deleteMany({ where: { diagnosticRunId: run.id } });
        await tx.dataQualityAssessment.deleteMany({ where: { diagnosticRunId: run.id } });
        await tx.financialMetric.deleteMany({ where: { diagnosticRunId: run.id } });

        await tx.diagnosticInputSnapshot.update({
          where: { diagnosticRunId: run.id },
          data: {
            contentHash: snapshot.contentHash,
            payload: {
              ...pendingPayload,
              warnings: snapshot.warnings,
              lines: snapshot.lines,
            },
            documentIds: snapshot.documentIds,
            extractionIds: snapshot.extractionIds,
          },
        });

        if (engine.metrics.length) {
          await tx.financialMetric.createMany({
            data: engine.metrics.map((m) => ({
              organizationId,
              diagnosticRunId: run.id,
              code: m.code,
              label: m.label,
              dimension: m.dimension,
              status: m.status,
              value: m.value,
              unit: m.unit,
              formulaId: m.formulaId,
              periodStart: m.periodStart ? new Date(m.periodStart) : null,
              periodEnd: m.periodEnd ? new Date(m.periodEnd) : null,
              periodLabel: m.periodLabel,
              inputRefs: m.inputRefs,
              warnings: m.warnings,
            })),
          });
        }

        await tx.dataQualityAssessment.create({
          data: {
            organizationId,
            diagnosticRunId: run.id,
            completeness: engine.quality.completeness,
            consistency: engine.quality.consistency,
            evidenceReliability: engine.quality.evidenceReliability,
            diagnosticCoverage: engine.quality.diagnosticCoverage,
            details: engine.quality.details as Prisma.InputJsonValue,
          },
        });

        const score = await tx.diagnosticScore.create({
          data: {
            organizationId,
            diagnosticRunId: run.id,
            status: engine.score.status,
            overallScore: engine.score.overallScore,
            methodologyVersion: engine.score.methodologyVersion,
            limitations: engine.score.limitations,
          },
        });

        if (engine.score.components.length) {
          await tx.scoreComponent.createMany({
            data: engine.score.components.map((c) => ({
              organizationId,
              diagnosticScoreId: score.id,
              dimension: c.dimension,
              weight: c.weight,
              included: c.included,
              score: c.score,
              exclusionReason: c.exclusionReason,
              metricCodes: c.metricCodes,
            })),
          });
        }

        for (const finding of engine.findings) {
          const rule = await tx.diagnosticRuleVersion.findFirst({
            where: {
              ruleSetId: RULE_SET_ID,
              ruleId: finding.ruleId,
              version: engine.ruleSetVersion,
            },
          });
          const created = await tx.diagnosticFinding.create({
            data: {
              organizationId,
              diagnosticRunId: run.id,
              ruleVersionId: rule?.id ?? null,
              ruleId: finding.ruleId,
              ruleSetVersion: engine.ruleSetVersion,
              category: finding.category,
              severity: finding.severity,
              title: finding.title,
              explanation: finding.explanation,
              implication: finding.implication,
              suggestedAction: finding.suggestedAction,
              confidence: finding.confidence,
              supportingMetrics: finding.supportingMetrics,
            },
          });
          if (finding.evidence.length) {
            await tx.diagnosticEvidenceLink.createMany({
              data: finding.evidence.map((e) => ({
                organizationId,
                findingId: created.id,
                documentId: e.documentId,
                lineItemId: e.lineItemId,
                evidenceReferenceId: e.evidenceReferenceId,
                snapshotKey: e.snapshotKey,
                label: e.label,
              })),
            });
          }
        }

        await tx.diagnosticRun.update({
          where: { id: run.id },
          data: {
            status: "SUCCEEDED",
            currency: snapshot.currency,
            periodStart: snapshot.periodStart ? new Date(snapshot.periodStart) : null,
            periodEnd: snapshot.periodEnd ? new Date(snapshot.periodEnd) : null,
            periodLabel: snapshot.periodLabel,
            calculationEngineVersion: engine.calculationEngineVersion,
            ruleSetVersion: engine.ruleSetVersion,
            scoreMethodologyVersion: engine.scoreMethodologyVersion,
            completedAt: new Date(),
            failureClass: null,
            failureMessage: null,
          },
        });

        await tx.auditEvent.create({
          data: {
            organizationId,
            actorUserId: job.data.actorUserId,
            action: "diagnostic.completed",
            entityType: "diagnostic_run",
            entityId: run.id,
            requestId: job.data.correlationId ?? null,
            metadata: {
              scoreStatus: engine.score.status,
              overallScore: engine.score.overallScore,
              findingCount: engine.findings.length,
            },
          },
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Diagnostic failed";
      this.logger.error(`Diagnostic run ${diagnosticRunId} failed: ${message}`);
      await this.prisma.diagnosticRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          failureClass: "INTERNAL",
          failureMessage: message.slice(0, 500),
          completedAt: new Date(),
        },
      });
      await this.prisma.auditEvent.create({
        data: {
          organizationId,
          actorUserId: job.data.actorUserId,
          action: "diagnostic.failed",
          entityType: "diagnostic_run",
          entityId: run.id,
          requestId: job.data.correlationId ?? null,
          metadata: { message: message.slice(0, 200) },
        },
      });
      throw error;
    }
  }

  private async ensureRuleCatalog(): Promise<void> {
    for (const rule of RULES_V1) {
      await this.prisma.diagnosticRuleVersion.upsert({
        where: {
          ruleSetId_ruleId_version: {
            ruleSetId: rule.ruleSetId,
            ruleId: rule.ruleId,
            version: rule.version,
          },
        },
        create: {
          ruleSetId: rule.ruleSetId,
          ruleId: rule.ruleId,
          version: rule.version,
          title: rule.title,
          description: rule.description,
          category: rule.category,
          active: true,
        },
        update: {
          title: rule.title,
          description: rule.description,
          category: rule.category,
          active: true,
        },
      });
    }
  }
}
