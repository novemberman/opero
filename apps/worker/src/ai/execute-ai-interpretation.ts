import {
  AiProviderError,
  buildAiContext,
  checkNarrativeGrounding,
  createAiProviderFromEnv,
  type AiProviderPort,
} from "@opero/ai";
import type { Prisma, PrismaClient } from "@opero/database";

export type AiExecutionJob = {
  organizationId: string;
  aiInterpretationRunId: string;
  actorUserId: string;
  correlationId?: string;
  userNotes?: string;
};

export type AiExecutionSettings = {
  /** AI_SHARE_STRUCTURED_CONTEXT. When false nothing is sent to any provider. */
  shareStructuredContext: boolean;
  /** AI_PROVIDER, OPENAI_* and AI_TIMEOUT_MS, as read by `createAiProviderFromEnv`. */
  providerEnv: Record<string, string | undefined>;
  /** Overrides provider construction. Used by tests to avoid any network access. */
  createProvider?: (env: Record<string, string | undefined>) => AiProviderPort;
};

export type AiExecutionOutcome = "SUCCEEDED" | "FAILED" | "UNAVAILABLE" | "SKIPPED";

const SHARING_DISABLED =
  "Sharing structured diagnostic context with the AI provider is disabled (AI_SHARE_STRUCTURED_CONTEXT=false)";

const TRANSIENT_CODES = new Set(["TIMEOUT", "NETWORK", "HTTP_ERROR"]);

/** Statuses a delivery may still act on. Every write to the run is limited to them. */
const UNFINISHED = ["QUEUED", "RUNNING"] as const;

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * Generates one AI interpretation version for a queued run.
 *
 * The provider only ever receives the context built by `buildAiContext` from
 * the run's metrics, findings, quality and score rows. Documents, extractions,
 * line items and the input snapshot are never loaded here.
 *
 * Safe under duplicate delivery: a run is only ever moved out of QUEUED or
 * RUNNING, and the narrative version is written in the transaction that
 * claims the run. A second delivery of the same job therefore cannot add a
 * second version or overwrite a recorded outcome; it returns SKIPPED.
 *
 * Returns the terminal status written to the run, or SKIPPED when another
 * delivery had already finished it. Throws only when the failure is worth
 * retrying and `finalAttempt` is false.
 */
export async function executeAiInterpretation(
  prisma: PrismaClient,
  settings: AiExecutionSettings,
  job: AiExecutionJob,
  options: { finalAttempt: boolean },
): Promise<AiExecutionOutcome> {
  const { organizationId, aiInterpretationRunId } = job;

  const run = await prisma.aIInterpretationRun.findFirst({
    where: { id: aiInterpretationRunId, organizationId },
    include: { run: { select: { id: true, status: true, currency: true, periodLabel: true } } },
  });
  if (!run) throw new Error("AI interpretation run not found for tenant context");

  if (["SUCCEEDED", "FAILED", "UNAVAILABLE"].includes(run.status)) {
    return "SKIPPED";
  }

  const finish = async (
    status: "FAILED" | "UNAVAILABLE",
    failureMessage: string,
  ): Promise<"FAILED" | "UNAVAILABLE" | "SKIPPED"> => {
    // An outcome recorded by another delivery of this job is never overwritten.
    const closed = await prisma.aIInterpretationRun.updateMany({
      where: { id: run.id, organizationId, status: { in: [...UNFINISHED] } },
      data: { status, failureMessage: failureMessage.slice(0, 500), completedAt: new Date() },
    });
    if (closed.count !== 1) return "SKIPPED";
    await prisma.auditEvent.create({
      data: {
        organizationId,
        actorUserId: job.actorUserId,
        action: status === "FAILED" ? "ai.interpretation_failed" : "ai.interpretation_unavailable",
        entityType: "ai_interpretation_run",
        entityId: run.id,
        requestId: job.correlationId ?? null,
        metadata: { message: failureMessage.slice(0, 200) },
      },
    });
    return status;
  };

  if (!settings.shareStructuredContext) {
    return finish("UNAVAILABLE", SHARING_DISABLED);
  }
  if (run.run.status !== "SUCCEEDED") {
    return finish("FAILED", "The diagnostic run has not SUCCEEDED");
  }

  const started = await prisma.aIInterpretationRun.updateMany({
    where: { id: run.id, organizationId, status: { in: [...UNFINISHED] } },
    data: { status: "RUNNING", startedAt: run.startedAt ?? new Date() },
  });
  if (started.count !== 1) return "SKIPPED";

  try {
    const where = { organizationId, diagnosticRunId: run.diagnosticRunId };
    const [metrics, findings, quality, score] = await Promise.all([
      prisma.financialMetric.findMany({
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
          warnings: true,
        },
      }),
      prisma.diagnosticFinding.findMany({
        where,
        orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          ruleId: true,
          category: true,
          severity: true,
          title: true,
          explanation: true,
          implication: true,
          suggestedAction: true,
          supportingMetrics: true,
        },
      }),
      prisma.dataQualityAssessment.findFirst({
        where,
        select: {
          completeness: true,
          consistency: true,
          evidenceReliability: true,
          diagnosticCoverage: true,
        },
      }),
      prisma.diagnosticScore.findFirst({
        where,
        select: {
          status: true,
          overallScore: true,
          methodologyVersion: true,
          limitations: true,
          components: {
            select: { dimension: true, included: true, score: true, exclusionReason: true },
          },
        },
      }),
    ]);
    if (!quality || !score) {
      return await finish("FAILED", "Diagnostic quality or score results are missing");
    }

    const context = buildAiContext({
      metrics: metrics.map((metric) => ({ ...metric, warnings: stringList(metric.warnings) })),
      findings,
      quality,
      score: { ...score, limitations: stringList(score.limitations) },
      currency: run.run.currency,
      periodLabel: run.run.periodLabel,
      userNotes: job.userNotes ? [job.userNotes] : [],
    });

    const provider = (settings.createProvider ?? createAiProviderFromEnv)(settings.providerEnv);
    // The provider works on a copy, so nothing it does to the facts can
    // influence the grounding check or anything stored below.
    const result = await provider.interpret(structuredClone(context));
    // References, quoted figures and restricted wording, across claims and prose.
    const grounding = checkNarrativeGrounding(result, context);

    const stored = await prisma.$transaction(async (tx) => {
      // Claiming the run first serializes duplicate deliveries: the loser finds
      // the run already finished and writes nothing.
      const claimed = await tx.aIInterpretationRun.updateMany({
        where: { id: run.id, organizationId, status: { in: [...UNFINISHED] } },
        data: {
          status: "SUCCEEDED",
          provider: result.provider,
          model: result.model,
          promptVersion: result.promptVersion,
          failureMessage: null,
          completedAt: new Date(),
        },
      });
      if (claimed.count !== 1) return false;

      const latest = await tx.aIInterpretationVersion.findFirst({
        where: { aiInterpretationRunId: run.id },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      const version = await tx.aIInterpretationVersion.create({
        data: {
          organizationId,
          aiInterpretationRunId: run.id,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          narrative: result.narrative as Prisma.InputJsonValue,
          groundedClaims: grounding.groundedClaims as Prisma.InputJsonValue,
          unsupportedClaims: grounding.unsupportedClaims as Prisma.InputJsonValue,
          isSimulated: result.isSimulated,
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId: job.actorUserId,
          action: "ai.interpretation_completed",
          entityType: "ai_interpretation_run",
          entityId: run.id,
          requestId: job.correlationId ?? null,
          metadata: {
            versionId: version.id,
            provider: result.provider,
            isSimulated: result.isSimulated,
            groundedClaims: grounding.groundedClaims.length,
            unsupportedClaims: grounding.unsupportedClaims.length,
          },
        },
      });
      return true;
    });
    return stored ? "SUCCEEDED" : "SKIPPED";
  } catch (error) {
    if (error instanceof AiProviderError) {
      // Provider messages never contain credentials or response bodies.
      if (error.code === "CONFIG") {
        return finish("UNAVAILABLE", `AI provider is not configured: ${error.message}`);
      }
      if (!options.finalAttempt) throw error;
      return finish(TRANSIENT_CODES.has(error.code) ? "UNAVAILABLE" : "FAILED", error.message);
    }
    if (!options.finalAttempt) throw error;
    return finish("FAILED", "AI interpretation failed unexpectedly");
  }
}
