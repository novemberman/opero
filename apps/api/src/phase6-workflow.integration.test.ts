/**
 * Phase 6 acceptance: end-to-end workflow against real Postgres + Nest API.
 *
 * Real services: Nest HTTP API, Prisma/Postgres, Redis (queue registration),
 * in-process diagnostic engine, mock AI provider, pdfkit PDF, memory object storage.
 * Mocks: ClamAV (DOCUMENT_SCANNER_DRIVER=mock), AI_PROVIDER=mock, no live OpenAI,
 * document bytes seeded (upload/scan path covered separately in documents suite).
 */
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./testing/app-factory";
import type { MemoryEmailService } from "./testing/memory-email.service";
import {
  SCORABLE_STATEMENTS,
  cleanupPhase6,
  createOrganization,
  get,
  grantXrayProAccess,
  patch,
  post,
  resetDatabase,
  runDiagnostic,
  seedDocument,
  signUp,
  testPrisma,
  type TestSession,
} from "./testing/phase6-fixtures";
import { executeAiInterpretation } from "./ai/run-ai-interpretation-job";

describe("Phase 6 complete workflow", () => {
  let app: INestApplication;
  let mail: MemoryEmailService;
  let owner: TestSession;
  let organizationId: string;
  const prisma = testPrisma();

  beforeAll(async () => {
    await resetDatabase();
    ({ app, mail } = await createTestApp());
    owner = await signUp(app, mail, "workflow-owner");
    organizationId = await createOrganization(app, owner, "workflow");
  });

  afterAll(async () => {
    await cleanupPhase6(app);
    await app.close();
    await prisma.$disconnect();
  });

  it("runs metadata → readiness → diagnostic → AI → report → publish → PDF", async () => {
    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: SCORABLE_STATEMENTS,
    });
    const statementId = seeded.statementIds.at(-1)!;
    const org = `/organizations/${organizationId}`;

    // 1. Metadata review + confirm (persisted + audited)
    const meta = await patch(app, owner, `${org}/statements/${statementId}/metadata`)
      .send({
        periodType: "ANNUAL",
        consolidationScope: "ENTITY",
        entityName: "Workflow Co",
        confirm: true,
        note: "Confirmed for Phase 6 acceptance",
      })
      .expect(200);
    expect(meta.body.metadata.periodType).toBe("ANNUAL");
    expect(meta.body.metadata.confirmedAt).toBeTruthy();
    expect(meta.body.review.nextValues).toMatchObject({
      confirmed: true,
      periodType: "ANNUAL",
      entityName: "Workflow Co",
    });

    const metaAudits = await prisma.auditEvent.findMany({
      where: { organizationId, entityId: statementId },
    });
    expect(metaAudits.map((e) => e.action)).toContain("statement.metadata_confirmed");

    // 2. Readiness assessment
    const readiness = await post(app, owner, `${org}/readiness/assess`)
      .send({ documentIds: [seeded.documentId] })
      .expect(201);
    expect(["READY", "PARTIALLY_READY", "ACTION_REQUIRED"]).toContain(
      readiness.body.assessment.status,
    );
    expect(readiness.body.assessment.status).not.toBe("BLOCKED");

    // 3. Deterministic diagnostic
    const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);
    const runBefore = await prisma.diagnosticRun.findFirstOrThrow({
      where: { id: diagnosticRunId, organizationId },
      include: { snapshot: true, score: true, metrics: true },
    });
    expect(runBefore.status).toBe("SUCCEEDED");
    expect(runBefore.snapshot?.contentHash).toBeTruthy();
    const metricSnapshot = runBefore.metrics.map((m) => `${m.code}:${m.value}:${m.status}`).sort();
    const scoreBefore = {
      status: runBefore.score?.status,
      overall: runBefore.score?.overallScore,
    };

    // 4. Evidence reconciliation list (empty for clean fixture)
    const recon = await get(
      app,
      owner,
      `${org}/reconciliations?diagnosticRunId=${diagnosticRunId}`,
    ).expect(200);
    expect(Array.isArray(recon.body.reconciliations)).toBe(true);
    const openCritical = (
      recon.body.reconciliations as Array<{ status: string; severity: string }>
    ).filter((r) => r.status === "OPEN" && r.severity === "CRITICAL");
    expect(openCritical).toHaveLength(0);

    // 5. AI interpretation (mock, simulated)
    const aiCreated = await post(app, owner, `${org}/ai/interpretations`)
      .send({ diagnosticRunId })
      .expect(201);
    const aiRunId = aiCreated.body.run.id as string;
    const aiOutcome = await executeAiInterpretation(
      prisma,
      { shareStructuredContext: true, providerEnv: { AI_PROVIDER: "mock" } },
      { organizationId, aiInterpretationRunId: aiRunId, actorUserId: owner.userId },
      { finalAttempt: true },
    );
    expect(aiOutcome).toBe("SUCCEEDED");
    const aiVersion = await prisma.aIInterpretationVersion.findFirstOrThrow({
      where: { aiInterpretationRunId: aiRunId },
      orderBy: { versionNumber: "desc" },
    });
    expect(aiVersion.isSimulated).toBe(true);

    // AI must not mutate diagnostic KPIs/score
    const runAfterAi = await prisma.diagnosticRun.findFirstOrThrow({
      where: { id: diagnosticRunId },
      include: { snapshot: true, score: true, metrics: true },
    });
    expect(runAfterAi.snapshot?.contentHash).toBe(runBefore.snapshot?.contentHash);
    expect(runAfterAi.score?.status).toBe(scoreBefore.status);
    expect(runAfterAi.score?.overallScore).toBe(scoreBefore.overall);
    expect(runAfterAi.metrics.map((m) => `${m.code}:${m.value}:${m.status}`).sort()).toEqual(
      metricSnapshot,
    );

    // 6. Report draft → review → approve → publish
    const created = await post(app, owner, `${org}/reports`)
      .send({
        diagnosticRunId,
        title: "Phase 6 Acceptance Report",
        aiInterpretationVersionId: aiVersion.id,
      })
      .expect(201);
    const reportId = created.body.report.id as string;
    expect(created.body.report.status).toBe("DRAFT");

    await post(app, owner, `${org}/reports/${reportId}/submit-review`).send({}).expect(200);
    await post(app, owner, `${org}/reports/${reportId}/approve`)
      .send({ note: "Owner acceptance approval" })
      .expect(200);
    const published = await post(app, owner, `${org}/reports/${reportId}/publish`)
      .send({})
      .expect(200);
    expect(published.body.report.status).toBe("PUBLISHED");
    expect(published.body.preview.verifiedPublication).toBe(scoreBefore.status === "SCORED");
    await grantXrayProAccess(prisma, organizationId, reportId);

    // 7. Private PDF download (requires commercial entitlement after Phase 7A)
    const pdf = await get(app, owner, `${org}/reports/${reportId}/pdf`)
      .buffer(true)
      .parse((res, callback) => {
        const data: Buffer[] = [];
        res.on("data", (chunk: Buffer) => data.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(data)));
      })
      .expect(200);
    expect(pdf.headers["content-type"]).toMatch(/pdf/);
    const bytes = pdf.body as Buffer;
    expect(bytes.subarray(0, 4).toString("utf8")).toBe("%PDF");

    // 8. Audit trail for approve / publish / download
    const audits = await prisma.auditEvent.findMany({
      where: { organizationId, entityId: reportId },
    });
    const actions = audits.map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(["report.approved", "report.published", "report.downloaded"]),
    );

    const access = await prisma.reportAccessEvent.findMany({
      where: { organizationId, reportId, action: "DOWNLOAD" },
    });
    expect(access.length).toBeGreaterThanOrEqual(1);

    // 9. Historical diagnostic snapshot unchanged after post-publish metadata edit
    await patch(app, owner, `${org}/statements/${statementId}/metadata`)
      .send({ entityName: "Workflow Co Renamed", confirm: true, note: "Post-publish rename" })
      .expect(200);
    const runFinal = await prisma.diagnosticRun.findFirstOrThrow({
      where: { id: diagnosticRunId },
      include: { snapshot: true, metrics: true, score: true },
    });
    expect(runFinal.snapshot?.contentHash).toBe(runBefore.snapshot?.contentHash);
    expect(runFinal.metrics.map((m) => `${m.code}:${m.value}:${m.status}`).sort()).toEqual(
      metricSnapshot,
    );
    expect(runFinal.score?.overallScore).toBe(scoreBefore.overall);
  }, 120_000);
});
