import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import {
  CALC_ENGINE_VERSION,
  RULE_SET_VERSION,
  SCORE_METHODOLOGY_VERSION,
} from "@opero/diagnostics";
import type { PrismaClient } from "@opero/database";
import type { Queue } from "bullmq";
import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/database.constants";
import type { AuthenticatedUser } from "../types/express";
import { DIAGNOSTIC_RUN_JOB, DIAGNOSTICS_QUEUE_NAME } from "./diagnostics.queue";

@Injectable()
export class DiagnosticsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @InjectQueue(DIAGNOSTICS_QUEUE_NAME) private readonly queue: Queue,
    private readonly audit: AuditService,
  ) {}

  async createRun(input: {
    organizationId: string;
    actor: AuthenticatedUser;
    documentIds: string[];
    currency?: string;
    periodLabel?: string;
    requestId?: string;
  }) {
    const uniqueIds = [...new Set(input.documentIds)];
    const documents = await this.prisma.document.findMany({
      where: {
        organizationId: input.organizationId,
        id: { in: uniqueIds },
        deletionStatus: "ACTIVE",
        scanStatus: "CLEAN",
      },
      select: { id: true, processingStatus: true },
    });
    if (documents.length !== uniqueIds.length) {
      throw new BadRequestException(
        "One or more documents are missing, not clean-scanned, or not in this organization",
      );
    }

    const activeRun = await this.prisma.diagnosticRun.findFirst({
      where: {
        organizationId: input.organizationId,
        status: { in: ["QUEUED", "RUNNING"] },
      },
      select: { id: true },
    });
    if (activeRun) {
      throw new ConflictException("A diagnostic run is already in progress for this organization");
    }

    const run = await this.prisma.diagnosticRun.create({
      data: {
        organizationId: input.organizationId,
        initiatedByUserId: input.actor.id,
        status: "QUEUED",
        currency: input.currency ?? null,
        periodLabel: input.periodLabel ?? null,
        calculationEngineVersion: CALC_ENGINE_VERSION,
        ruleSetVersion: RULE_SET_VERSION,
        scoreMethodologyVersion: SCORE_METHODOLOGY_VERSION,
        requestId: input.requestId ?? null,
      },
    });

    // Stash requested document ids on a temporary snapshot shell for the worker.
    await this.prisma.diagnosticInputSnapshot.create({
      data: {
        organizationId: input.organizationId,
        diagnosticRunId: run.id,
        contentHash: "pending",
        payload: {
          requestedDocumentIds: uniqueIds,
          currency: input.currency ?? null,
          periodLabel: input.periodLabel ?? null,
        },
        documentIds: uniqueIds,
        extractionIds: [],
      },
    });

    const job = await this.queue.add(
      DIAGNOSTIC_RUN_JOB,
      {
        organizationId: input.organizationId,
        diagnosticRunId: run.id,
        actorUserId: input.actor.id,
        correlationId: input.requestId,
      },
      {
        jobId: run.id,
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );

    await this.prisma.diagnosticRun.update({
      where: { id: run.id },
      data: { bullJobId: String(job.id) },
    });

    await this.audit.record({
      action: "diagnostic.started",
      entityType: "diagnostic_run",
      entityId: run.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: { documentIds: uniqueIds },
    });

    return run;
  }

  async listRuns(organizationId: string) {
    return this.prisma.diagnosticRun.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        currency: true,
        periodLabel: true,
        periodStart: true,
        periodEnd: true,
        calculationEngineVersion: true,
        ruleSetVersion: true,
        scoreMethodologyVersion: true,
        createdAt: true,
        completedAt: true,
        score: { select: { status: true, overallScore: true } },
      },
    });
  }

  async getRun(organizationId: string, runId: string) {
    const run = await this.prisma.diagnosticRun.findFirst({
      where: { id: runId, organizationId },
      include: {
        snapshot: { select: { contentHash: true, documentIds: true, extractionIds: true } },
        quality: true,
        score: { include: { components: true } },
      },
    });
    if (!run) throw new NotFoundException("Diagnostic run not found");
    return run;
  }

  async getMetrics(organizationId: string, runId: string) {
    await this.requireRun(organizationId, runId);
    return this.prisma.financialMetric.findMany({
      where: { organizationId, diagnosticRunId: runId },
      orderBy: [{ dimension: "asc" }, { code: "asc" }],
    });
  }

  async getQuality(organizationId: string, runId: string) {
    await this.requireRun(organizationId, runId);
    const quality = await this.prisma.dataQualityAssessment.findFirst({
      where: { organizationId, diagnosticRunId: runId },
    });
    if (!quality) throw new NotFoundException("Quality assessment not found");
    return quality;
  }

  async getScore(organizationId: string, runId: string) {
    await this.requireRun(organizationId, runId);
    const score = await this.prisma.diagnosticScore.findFirst({
      where: { organizationId, diagnosticRunId: runId },
      include: { components: true },
    });
    if (!score) throw new NotFoundException("Score not found");
    return score;
  }

  async getFindings(organizationId: string, runId: string) {
    await this.requireRun(organizationId, runId);
    return this.prisma.diagnosticFinding.findMany({
      where: { organizationId, diagnosticRunId: runId },
      include: { evidence: true },
      orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
    });
  }

  private async requireRun(organizationId: string, runId: string) {
    const run = await this.prisma.diagnosticRun.findFirst({
      where: { id: runId, organizationId },
      select: { id: true },
    });
    if (!run) throw new NotFoundException("Diagnostic run not found");
  }
}
