import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import {
  PROMPT_VERSION,
  buildAiContext,
  checkNarrativeGrounding,
  classifyGroundingResult,
} from "@opero/ai";
import type { Prisma, PrismaClient } from "@opero/database";
import type { AiInterpretJobPayload, EditAiInterpretationBody } from "@opero/shared";
import type { Queue } from "bullmq";
import { AuditService } from "../audit/audit.service";
import type { ApiEnv } from "../config/env";
import { PRISMA_CLIENT } from "../database/database.constants";
import type { AuthenticatedUser } from "../types/express";
import { AI_INTERPRET_JOB, AI_QUEUE_NAME } from "./ai.queue";
import { narrativeText } from "./narrative";

export const AI_SHARING_DISABLED_MESSAGE =
  "AI interpretation is unavailable: sharing structured diagnostic context with the AI provider is disabled (AI_SHARE_STRUCTURED_CONTEXT=false).";

@Injectable()
export class AiService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @InjectQueue(AI_QUEUE_NAME) private readonly queue: Queue,
    private readonly audit: AuditService,
    private readonly config: ConfigService<ApiEnv, true>,
  ) {}

  availability() {
    const provider = this.config.get("AI_PROVIDER", { infer: true });
    const shareStructuredContext = this.config.get("AI_SHARE_STRUCTURED_CONTEXT", {
      infer: true,
    });
    return {
      provider,
      /** The mock provider assembles text by fixed rules; it is not a live model. */
      simulated: provider === "mock",
      shareStructuredContext,
      available: shareStructuredContext,
      reason: shareStructuredContext ? null : AI_SHARING_DISABLED_MESSAGE,
    };
  }

  async createInterpretation(input: {
    organizationId: string;
    actor: AuthenticatedUser;
    diagnosticRunId: string;
    userNotes?: string;
    requestId?: string;
  }) {
    if (!this.config.get("AI_SHARE_STRUCTURED_CONTEXT", { infer: true })) {
      throw new ConflictException({
        message: AI_SHARING_DISABLED_MESSAGE,
        code: "AI_CONTEXT_SHARING_DISABLED",
      });
    }

    const diagnosticRun = await this.prisma.diagnosticRun.findFirst({
      where: { id: input.diagnosticRunId, organizationId: input.organizationId },
      select: { id: true, status: true },
    });
    if (!diagnosticRun) throw new NotFoundException("Diagnostic run not found");
    if (diagnosticRun.status !== "SUCCEEDED") {
      throw new ConflictException(
        "AI interpretation requires a diagnostic run that has SUCCEEDED",
      );
    }

    const active = await this.prisma.aIInterpretationRun.findFirst({
      where: {
        organizationId: input.organizationId,
        diagnosticRunId: diagnosticRun.id,
        status: { in: ["QUEUED", "RUNNING"] },
      },
      select: { id: true },
    });
    if (active) {
      throw new ConflictException(
        "An AI interpretation is already in progress for this diagnostic run",
      );
    }

    const provider = this.config.get("AI_PROVIDER", { infer: true });
    const run = await this.prisma.aIInterpretationRun.create({
      data: {
        organizationId: input.organizationId,
        diagnosticRunId: diagnosticRun.id,
        initiatedByUserId: input.actor.id,
        status: "QUEUED",
        provider,
        model: provider === "openai" ? (this.config.get("OPENAI_MODEL", { infer: true }) ?? null) : null,
        promptVersion: PROMPT_VERSION,
        requestId: input.requestId ?? null,
      },
    });

    const payload: AiInterpretJobPayload = {
      organizationId: input.organizationId,
      aiInterpretationRunId: run.id,
      actorUserId: input.actor.id,
      correlationId: input.requestId,
      userNotes: input.userNotes,
    };

    let bullJobId: string;
    try {
      const job = await this.queue.add(AI_INTERPRET_JOB, payload, {
        jobId: run.id,
        attempts: this.config.get("AI_MAX_RETRIES", { infer: true }) + 1,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      });
      bullJobId = String(job.id);
    } catch {
      // Do not leave a QUEUED row that no worker will ever pick up.
      await this.prisma.aIInterpretationRun.update({
        where: { id: run.id },
        data: {
          status: "UNAVAILABLE",
          failureMessage: "The AI job queue could not be reached",
          completedAt: new Date(),
        },
      });
      throw new ServiceUnavailableException("AI interpretation could not be queued");
    }

    const queued = await this.prisma.aIInterpretationRun.update({
      where: { id: run.id },
      data: { bullJobId },
    });

    await this.audit.record({
      action: "ai.interpretation_requested",
      entityType: "ai_interpretation_run",
      entityId: run.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: { diagnosticRunId: diagnosticRun.id, provider },
    });

    return queued;
  }

  async listRuns(organizationId: string, diagnosticRunId?: string) {
    return this.prisma.aIInterpretationRun.findMany({
      where: { organizationId, ...(diagnosticRunId ? { diagnosticRunId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        diagnosticRunId: true,
        status: true,
        provider: true,
        model: true,
        promptVersion: true,
        failureMessage: true,
        createdAt: true,
        completedAt: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          select: { id: true, versionNumber: true, isSimulated: true, editedByUserId: true },
        },
      },
    });
  }

  async getRun(organizationId: string, runId: string) {
    const run = await this.prisma.aIInterpretationRun.findFirst({
      where: { id: runId, organizationId },
      include: { versions: { orderBy: { versionNumber: "desc" } } },
    });
    if (!run) throw new NotFoundException("AI interpretation not found");
    return run;
  }

  /**
   * Creates a new interpretation version with the reviewer correction.
   * The prior version is left intact. Grounding is re-run on the final text.
   */
  async editVersion(input: {
    organizationId: string;
    runId: string;
    versionId: string;
    actor: AuthenticatedUser;
    edits: EditAiInterpretationBody;
    requestId?: string;
  }) {
    const version = await this.prisma.aIInterpretationVersion.findFirst({
      where: {
        id: input.versionId,
        organizationId: input.organizationId,
        aiInterpretationRunId: input.runId,
      },
      include: {
        interpretationRun: {
          select: { diagnosticRunId: true, status: true, provider: true, model: true },
        },
      },
    });
    if (!version) throw new NotFoundException("AI interpretation version not found");
    if (version.interpretationRun.status !== "SUCCEEDED") {
      throw new ConflictException("Only a SUCCEEDED interpretation can be corrected");
    }

    const editedFields = Object.keys(input.edits);
    if (editedFields.length === 0) {
      throw new BadRequestException("No narrative changes were provided");
    }

    const prior = (version.editedNarrative ?? version.narrative) as Record<string, unknown>;
    const base = narrativeText(prior);
    const claims = Array.isArray(prior.claims) ? prior.claims : [];
    const editedNarrative = {
      ...base,
      ...input.edits,
      claims,
    };

    const diagnosticRunId = version.interpretationRun.diagnosticRunId;
    const where = { organizationId: input.organizationId, diagnosticRunId };
    const [metrics, findings, quality, score] = await Promise.all([
      this.prisma.financialMetric.findMany({
        where,
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
      this.prisma.diagnosticFinding.findMany({
        where,
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
      this.prisma.dataQualityAssessment.findFirst({ where }),
      this.prisma.diagnosticScore.findFirst({
        where,
        include: { components: true },
      }),
    ]);
    if (!quality || !score) {
      throw new ConflictException("Diagnostic results required to re-validate the narrative");
    }

    const context = buildAiContext({
      metrics: metrics.map((metric) => ({
        ...metric,
        warnings: Array.isArray(metric.warnings)
          ? metric.warnings.filter((item): item is string => typeof item === "string")
          : [],
      })),
      findings,
      quality,
      score: {
        status: score.status,
        overallScore: score.overallScore,
        methodologyVersion: score.methodologyVersion,
        limitations: Array.isArray(score.limitations)
          ? score.limitations.filter((item): item is string => typeof item === "string")
          : [],
        components: score.components.map((component) => ({
          dimension: component.dimension,
          included: component.included,
          score: component.score,
          exclusionReason: component.exclusionReason,
        })),
      },
    });
    const grounding = classifyGroundingResult(
      checkNarrativeGrounding(
        {
          summary: editedNarrative.summary,
          keyObservations: editedNarrative.keyObservations,
          risks: editedNarrative.risks,
          limitations: editedNarrative.limitations,
          claims: claims as Array<{
            text: string;
            groundedMetricCodes: string[];
            groundedFindingIds: string[];
          }>,
        },
        context,
      ),
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.aIInterpretationVersion.findFirst({
        where: { aiInterpretationRunId: input.runId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      return tx.aIInterpretationVersion.create({
        data: {
          organizationId: input.organizationId,
          aiInterpretationRunId: input.runId,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          narrative: editedNarrative as Prisma.InputJsonValue,
          groundedClaims: grounding.groundedClaims as Prisma.InputJsonValue,
          unsupportedClaims: grounding.unsupportedClaims as Prisma.InputJsonValue,
          editedNarrative: editedNarrative as Prisma.InputJsonValue,
          editedByUserId: input.actor.id,
          isSimulated: version.isSimulated,
        },
      });
    });

    await this.audit.record({
      action: "ai.interpretation_corrected",
      entityType: "ai_interpretation_version",
      entityId: created.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: {
        aiInterpretationRunId: input.runId,
        priorVersionId: version.id,
        editedFields,
        groundingVersion: grounding.version,
        criticalCount: grounding.criticalViolations.length,
        passed: grounding.passed,
      },
    });

    return created;
  }
}