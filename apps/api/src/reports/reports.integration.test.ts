import type { INestApplication } from "@nestjs/common";
import type { ObjectStoragePort } from "@opero/object-storage";
import { DISCLOSURES } from "@opero/reports";
import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeAiInterpretation } from "../ai/run-ai-interpretation-job";
import { OBJECT_STORAGE } from "../storage/storage.constants";
import { createTestApp } from "../testing/app-factory";
import type { MemoryEmailService } from "../testing/memory-email.service";
import {
  FY2024,
  SCORABLE_STATEMENTS,
  UNSCORABLE_STATEMENTS,
  addMember,
  cleanupPhase6,
  createOrganization,
  get,
  post,
  resetDatabase,
  runDiagnostic,
  seedDocument,
  signUp,
  startDiagnostic,
  testPrisma,
  type TestSession,
} from "../testing/phase6-fixtures";

type VersionSummary = {
  id: string;
  versionNumber: number;
  status: string;
  storageKey: string | null;
  contentHash: string | null;
  byteSize: number | null;
  disclosures: {
    verifiedPublication: boolean;
    generatedAt: string;
    additionalDisclosures: string[];
    rendered: string[];
    /** Present when the version carries an AI narrative. */
    groundingValidation?: { passed: boolean; criticalCount: number } | null;
  } | null;
};

/** Reads a binary response body into a Buffer. */
function download(app: INestApplication, actor: TestSession, path: string) {
  return get(app, actor, path)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    });
}

describe("X-Ray reports integration", () => {
  let app: INestApplication;
  let mail: MemoryEmailService;
  const prisma = testPrisma();

  /** Walks a draft through review to publication as the given publisher. */
  async function reviewAndPublish(publisher: TestSession, organizationId: string, reportId: string) {
    const path = `/organizations/${organizationId}/reports/${reportId}`;
    await post(app, publisher, `${path}/submit-review`).send({}).expect(200);
    await post(app, publisher, `${path}/approve`).send({}).expect(200);
    return post(app, publisher, `${path}/publish`).send({}).expect(200);
  }

  beforeAll(async () => {
    await resetDatabase();
    ({ app, mail } = await createTestApp());
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await cleanupPhase6(app);
    await app.close();
  });

  it("creates a report without AI and enforces the review workflow, publish permission, tenant isolation and PDF access", async () => {
    const owner = await signUp(app, mail, "rep-owner");
    const organizationId = await createOrganization(app, owner, "rep");
    const analyst = await signUp(app, mail, "rep-analyst");
    await addMember(organizationId, analyst.userId, "ANALYST");
    const viewer = await signUp(app, mail, "rep-viewer");
    await addMember(organizationId, viewer.userId, "VIEWER");
    const outsider = await signUp(app, mail, "rep-outsider");
    const otherOrganizationId = await createOrganization(app, outsider, "rep-other");

    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: SCORABLE_STATEMENTS,
    });
    const base = `/organizations/${organizationId}/reports`;

    // A report needs a completed diagnostic.
    const queuedRunId = await startDiagnostic(app, owner, organizationId, [seeded.documentId]);
    const premature = await post(app, analyst, base)
      .send({ diagnosticRunId: queuedRunId })
      .expect(409);
    expect(premature.body.message).toMatch(/SUCCEEDED/);
    await prisma.diagnosticRun.update({ where: { id: queuedRunId }, data: { status: "CANCELLED" } });
    const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);

    await post(app, viewer, base).send({ diagnosticRunId }).expect(403);
    await post(app, outsider, base).send({ diagnosticRunId }).expect(404);
    await post(app, outsider, `/organizations/${otherOrganizationId}/reports`)
      .send({ diagnosticRunId })
      .expect(404);

    const created = await post(app, analyst, base)
      .send({ diagnosticRunId, title: "FY2024 X-Ray" })
      .expect(201);
    const reportId = created.body.report.id as string;
    const path = `${base}/${reportId}`;
    expect(created.body.report).toMatchObject({
      status: "DRAFT",
      title: "FY2024 X-Ray",
      verifiedPublication: false,
      publishedAt: null,
      diagnosticRunId,
    });
    expect(created.body.report.versions).toHaveLength(1);
    const firstVersionId = created.body.report.versions[0].id as string;
    expect(created.body.report.versions[0]).toMatchObject({
      versionNumber: 1,
      status: "DRAFT",
      aiInterpretationVersionId: null,
      storageKey: null,
    });
    // The draft preview is never presented as verified and carries no AI section.
    expect(created.body.preview).toMatchObject({
      title: "FY2024 X-Ray",
      verifiedPublication: false,
      currency: "USD",
    });
    expect(created.body.preview.score.status).toBe("SCORED");
    expect(created.body.preview.score.overall).toBeTypeOf("number");
    expect(created.body.preview.aiNarrative).toBeUndefined();
    expect(created.body.preview.disclosures).toContain(DISCLOSURES.notVerified);
    expect(created.body.preview.metrics.length).toBeGreaterThan(0);

    // The frozen snapshot holds diagnostic results only.
    const draftVersion = await get(app, viewer, `${path}/versions/${firstVersionId}`).expect(200);
    const snapshot = draftVersion.body.version.snapshotPayload;
    expect(snapshot.aiNarrative).toBeNull();
    expect(snapshot.score.status).toBe("SCORED");
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain(seeded.documentId);
    expect(serialized).not.toContain(seeded.filename);
    expect(Object.keys(snapshot)).not.toContain("lines");

    // No PDF exists before publication.
    await get(app, viewer, `${path}/pdf`).expect(409);

    // Publication steps require xray:publish and must happen in order.
    await post(app, viewer, `${path}/submit-review`).send({}).expect(403);
    await post(app, owner, `${path}/approve`).send({}).expect(409);
    await post(app, owner, `${path}/publish`).send({}).expect(409);
    const submitted = await post(app, analyst, `${path}/submit-review`)
      .send({ note: "Ready for review" })
      .expect(200);
    expect(submitted.body.report.status).toBe("REVIEW_REQUIRED");
    await post(app, analyst, `${path}/approve`).send({}).expect(403);
    await post(app, analyst, `${path}/reject`).send({}).expect(403);
    await post(app, analyst, `${path}/publish`).send({}).expect(403);
    await post(app, owner, `${path}/publish`).send({}).expect(409);
    await post(app, analyst, `${path}/versions`).send({}).expect(409);

    const approved = await post(app, owner, `${path}/approve`).send({}).expect(200);
    expect(approved.body.report.status).toBe("APPROVED");
    await post(app, analyst, `${path}/publish`).send({}).expect(403);

    const published = await post(app, owner, `${path}/publish`)
      .send({ note: "Approved for release" })
      .expect(200);
    expect(published.body.report).toMatchObject({
      status: "PUBLISHED",
      verifiedPublication: true,
    });
    expect(published.body.report.publishedAt).toBeTypeOf("string");
    expect(published.body.preview.verifiedPublication).toBe(true);
    expect(published.body.preview.disclosures).not.toContain(DISCLOSURES.notVerified);
    const publishedVersion = published.body.report.versions[0] as VersionSummary;
    expect(publishedVersion).toMatchObject({
      id: firstVersionId,
      status: "PUBLISHED",
      storageKey: `org/${organizationId}/reports/${reportId}/${firstVersionId}.pdf`,
    });
    expect(publishedVersion.disclosures?.verifiedPublication).toBe(true);
    // Non-blocking readiness gaps are disclosed rather than hidden.
    expect(publishedVersion.disclosures?.additionalDisclosures[0]).toMatch(
      /^Diagnostic readiness was ACTION_REQUIRED/,
    );
    expect(
      (published.body.report.approvals as Array<{ action: string; actor: { id: string } }>).map(
        (approval) => [approval.action, approval.actor.id],
      ),
    ).toEqual([
      ["SUBMIT_REVIEW", analyst.userId],
      ["APPROVE", owner.userId],
      ["PUBLISH", owner.userId],
    ]);

    // Any member with xray:read can download; every download is recorded.
    const pdf = await download(app, viewer, `${path}/pdf`).expect(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toBe(
      'attachment; filename="opero-xray-report-v1.pdf"',
    );
    const pdfBody = pdf.body as Buffer;
    expect(pdfBody.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdfBody.length).toBe(publishedVersion.byteSize);
    expect(createHash("sha256").update(pdfBody).digest("hex")).toBe(publishedVersion.contentHash);
    const downloads = await prisma.reportAccessEvent.findMany({
      where: { organizationId, reportId, action: "DOWNLOAD" },
    });
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatchObject({
      actorUserId: viewer.userId,
      reportVersionId: firstVersionId,
    });

    // No access without a session, membership, or through another organization.
    await request(app.getHttpServer()).get(`/api/v1${path}/pdf`).expect(401);
    await get(app, outsider, `${path}/pdf`).expect(404);
    await get(app, outsider, path).expect(404);
    await get(app, outsider, `${path}/versions`).expect(404);
    await post(app, outsider, `${path}/publish`).send({}).expect(404);
    const otherBase = `/organizations/${otherOrganizationId}/reports`;
    await get(app, outsider, `${otherBase}/${reportId}`).expect(404);
    await get(app, outsider, `${otherBase}/${reportId}/pdf`).expect(404);
    await get(app, outsider, `${otherBase}/${reportId}/versions/${firstVersionId}`).expect(404);
    await post(app, outsider, `${otherBase}/${reportId}/publish`).send({}).expect(404);
    await post(app, outsider, `${otherBase}/${reportId}/versions`).send({}).expect(404);
    const otherList = await get(app, outsider, otherBase).expect(200);
    expect(otherList.body.reports).toEqual([]);
    expect(
      await prisma.reportAccessEvent.count({ where: { reportId, actorUserId: outsider.userId } }),
    ).toBe(0);

    // A published report is immutable: no workflow step applies any more.
    const frozen = await prisma.xRayReportVersion.findUniqueOrThrow({
      where: { id: firstVersionId },
    });
    for (const step of ["submit-review", "approve", "reject", "publish"]) {
      const refused = await post(app, owner, `${path}/${step}`).send({}).expect(409);
      expect(refused.body.message).toMatch(/immutable/);
    }

    // Changes go into a new version; the published one stays intact and downloadable.
    await post(app, viewer, `${path}/versions`).send({}).expect(403);
    const revised = await post(app, analyst, `${path}/versions`)
      .send({ title: "FY2024 X-Ray (revised)" })
      .expect(201);
    expect(revised.body.report.status).toBe("DRAFT");
    expect(
      (revised.body.report.versions as VersionSummary[]).map((v) => [v.versionNumber, v.status]),
    ).toEqual([
      [2, "DRAFT"],
      [1, "PUBLISHED"],
    ]);
    const secondVersionId = revised.body.report.versions[0].id as string;
    const afterRevision = await prisma.xRayReportVersion.findUniqueOrThrow({
      where: { id: firstVersionId },
    });
    expect(afterRevision.snapshotPayload).toEqual(frozen.snapshotPayload);
    expect(afterRevision.contentHash).toBe(frozen.contentHash);
    expect(afterRevision.disclosures).toEqual(frozen.disclosures);
    const stillThere = await download(app, viewer, `${path}/pdf`).expect(200);
    expect(createHash("sha256").update(stillThere.body as Buffer).digest("hex")).toBe(
      frozen.contentHash,
    );

    // Publishing the new version supersedes the old one, which remains retrievable.
    const republished = await reviewAndPublish(owner, organizationId, reportId);
    expect(
      (republished.body.report.versions as VersionSummary[]).map((v) => [
        v.versionNumber,
        v.status,
      ]),
    ).toEqual([
      [2, "PUBLISHED"],
      [1, "SUPERSEDED"],
    ]);
    const latest = await download(app, viewer, `${path}/pdf`).expect(200);
    expect(latest.headers["content-disposition"]).toContain("opero-xray-report-v2.pdf");
    const superseded = await download(app, viewer, `${path}/pdf?versionId=${firstVersionId}`).expect(
      200,
    );
    expect(createHash("sha256").update(superseded.body as Buffer).digest("hex")).toBe(
      frozen.contentHash,
    );
    expect(
      (await prisma.xRayReportVersion.findUniqueOrThrow({ where: { id: firstVersionId } }))
        .snapshotPayload,
    ).toEqual(frozen.snapshotPayload);
    await get(app, viewer, `${path}/pdf?versionId=not-a-uuid`).expect(400);

    // A published PDF is never regenerated, whoever asks.
    await post(app, analyst, `${path}/versions/${secondVersionId}/render`).send({}).expect(403);
    const refusedRender = await post(app, owner, `${path}/versions/${secondVersionId}/render`)
      .send({})
      .expect(409);
    expect(refusedRender.body.code).toBe("PUBLISHED_PDF_IMMUTABLE");
    const unchanged = await download(app, viewer, `${path}/pdf`).expect(200);
    expect(createHash("sha256").update(unchanged.body as Buffer).digest("hex")).toBe(
      (republished.body.report.versions[0] as VersionSummary).contentHash,
    );

    const list = await get(app, viewer, base).expect(200);
    expect(list.body.reports).toHaveLength(1);
    expect(list.body.reports[0]).toMatchObject({
      id: reportId,
      status: "PUBLISHED",
      title: "FY2024 X-Ray (revised)",
      verifiedPublication: true,
    });
  });

  it("publishes INSUFFICIENT_DATA results only as a non-verified, limitations-forward report", async () => {
    const owner = await signUp(app, mail, "rep-unscored");
    const organizationId = await createOrganization(app, owner, "rep-unscored");
    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: UNSCORABLE_STATEMENTS,
    });
    const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);
    const score = await prisma.diagnosticScore.findFirstOrThrow({ where: { diagnosticRunId } });
    expect(score.status).toBe("INSUFFICIENT_DATA");

    const base = `/organizations/${organizationId}/reports`;
    const created = await post(app, owner, base).send({ diagnosticRunId }).expect(201);
    const reportId = created.body.report.id as string;
    expect(created.body.preview.score).toMatchObject({ status: "INSUFFICIENT_DATA", overall: null });

    const published = await reviewAndPublish(owner, organizationId, reportId);
    expect(published.body.report).toMatchObject({
      status: "PUBLISHED",
      verifiedPublication: false,
    });
    expect(published.body.preview.verifiedPublication).toBe(false);
    expect(published.body.preview.score).toMatchObject({
      status: "INSUFFICIENT_DATA",
      overall: null,
    });
    expect(published.body.preview.disclosures).toEqual(
      expect.arrayContaining([DISCLOSURES.notVerified, DISCLOSURES.notScored]),
    );
    expect(published.body.preview.disclosures).not.toContain(DISCLOSURES.provisionalScore);
    const version = published.body.report.versions[0] as VersionSummary;
    expect(version.disclosures?.verifiedPublication).toBe(false);
    expect(version.disclosures?.rendered).toEqual(published.body.preview.disclosures);

    // Published disclosures are immutable at the database layer.
    await expect(
      prisma.xRayReportVersion.update({
        where: { id: version.id },
        data: { disclosures: { ...version.disclosures, verifiedPublication: true } },
      }),
    ).rejects.toThrow(/immutable/);
    const afterLock = await get(app, owner, `${base}/${reportId}`).expect(200);
    expect(afterLock.body.preview.verifiedPublication).toBe(false);
    expect(afterLock.body.preview.disclosures).toContain(DISCLOSURES.notVerified);

    const pdf = await download(app, owner, `${base}/${reportId}/pdf`).expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    const row = await prisma.xRayReport.findUniqueOrThrow({ where: { id: reportId } });
    expect(row.verifiedPublication).toBe(false);
  });

  it("gates creation and publication on readiness and critical evidence conflicts", async () => {
    const owner = await signUp(app, mail, "rep-gates");
    const organizationId = await createOrganization(app, owner, "rep-gates");
    const first = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: SCORABLE_STATEMENTS,
    });
    const second = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: [{ ...FY2024, lines: [["REVENUE", "2000"]] }],
    });
    const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [
      first.documentId,
      second.documentId,
    ]);
    const base = `/organizations/${organizationId}/reports`;
    const reconciliations = `/organizations/${organizationId}/reconciliations`;

    // The two documents disagree on revenue: a critical conflict blocks the report.
    const blocked = await post(app, owner, base).send({ diagnosticRunId }).expect(409);
    expect(blocked.body.code).toBe("READINESS_BLOCKED");
    expect(blocked.body.blockingReasons).toEqual(["Unresolved critical evidence conflicts"]);
    expect(await prisma.xRayReport.count({ where: { organizationId } })).toBe(0);

    const open = await get(app, owner, `${reconciliations}?diagnosticRunId=${diagnosticRunId}`)
      .expect(200);
    expect(open.body.reconciliations).toHaveLength(1);
    await post(app, owner, `${reconciliations}/${open.body.reconciliations[0].id}/resolve`)
      .send({
        resolution: "SELECT_AUTHORITATIVE",
        selectedLineItemId: first.lineItemIds["FY2024:REVENUE"],
        reason: "Audited accounts take precedence",
      })
      .expect(200);

    const created = await post(app, owner, base).send({ diagnosticRunId }).expect(201);
    const reportId = created.body.report.id as string;
    const path = `${base}/${reportId}`;
    await post(app, owner, `${path}/submit-review`).send({}).expect(200);

    // A reviewer can send the report back; a rejected version cannot be resubmitted.
    const rejected = await post(app, owner, `${path}/reject`)
      .send({ note: "Needs another look" })
      .expect(200);
    expect(rejected.body.report.status).toBe("REJECTED");
    await post(app, owner, `${path}/submit-review`).send({}).expect(409);
    await post(app, owner, `${path}/publish`).send({}).expect(409);
    const redrafted = await post(app, owner, `${path}/versions`).send({}).expect(201);
    expect(
      (redrafted.body.report.versions as VersionSummary[]).map((v) => [v.versionNumber, v.status]),
    ).toEqual([
      [2, "DRAFT"],
      [1, "SUPERSEDED"],
    ]);
    await post(app, owner, `${path}/submit-review`).send({}).expect(200);
    await post(app, owner, `${path}/approve`).send({}).expect(200);

    // A critical conflict that is open at publication time blocks an approved report.
    const conflict = await prisma.evidenceReconciliation.create({
      data: {
        organizationId,
        diagnosticRunId,
        conflictKey: "value:EQUITY:test",
        concept: "EQUITY",
        severity: "CRITICAL",
        title: "Conflicting values for EQUITY",
        explanation: "Inserted by the test",
        candidates: [],
      },
    });
    const conflicted = await post(app, owner, `${path}/publish`).send({}).expect(409);
    expect(conflicted.body).toMatchObject({
      code: "CRITICAL_RECONCILIATIONS_OPEN",
      openCritical: 1,
    });
    const stillApproved = await get(app, owner, path).expect(200);
    expect(stillApproved.body.report.status).toBe("APPROVED");
    expect(stillApproved.body.report.versions[0].storageKey).toBeNull();
    await post(app, owner, `${reconciliations}/${conflict.id}/resolve`)
      .send({ resolution: "DISMISS", reason: "Duplicate entry" })
      .expect(200);

    // Withdrawn source evidence blocks publication as well.
    await prisma.document.update({
      where: { id: second.documentId },
      data: { deletionStatus: "DELETED", deletedAt: new Date() },
    });
    const withdrawn = await post(app, owner, `${path}/publish`).send({}).expect(409);
    expect(withdrawn.body.code).toBe("READINESS_BLOCKED");
    await prisma.document.update({
      where: { id: second.documentId },
      data: { deletionStatus: "ACTIVE", deletedAt: null },
    });

    const published = await post(app, owner, `${path}/publish`).send({}).expect(200);
    expect(published.body.report.status).toBe("PUBLISHED");
  });

  it("attaches a reviewed AI interpretation and labels simulated output", async () => {
    const owner = await signUp(app, mail, "rep-ai");
    const organizationId = await createOrganization(app, owner, "rep-ai");
    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: SCORABLE_STATEMENTS,
    });
    const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);
    const base = `/organizations/${organizationId}/reports`;
    const ai = `/organizations/${organizationId}/ai/interpretations`;

    const interpretation = await post(app, owner, ai).send({ diagnosticRunId }).expect(201);
    const aiRunId = interpretation.body.run.id as string;
    await executeAiInterpretation(
      prisma,
      { shareStructuredContext: true, providerEnv: { AI_PROVIDER: "mock" } },
      { organizationId, aiInterpretationRunId: aiRunId, actorUserId: owner.userId },
      { finalAttempt: true },
    );
    const aiRun = await get(app, owner, `${ai}/${aiRunId}`).expect(200);
    const generatedVersionId = aiRun.body.run.versions[0].id as string;
    // A reviewer correction is a new interpretation version; that is what gets attached.
    const reviewed = await post(app, owner, `${ai}/${aiRunId}/versions/${generatedVersionId}/edit`)
      .send({ summary: "Reviewed summary of the diagnostic." })
      .expect(200);
    const aiVersionId = reviewed.body.version.id as string;
    expect(aiVersionId).not.toBe(generatedVersionId);

    // An interpretation of a different diagnostic run cannot be attached.
    const otherRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);
    await post(app, owner, base)
      .send({ diagnosticRunId: otherRunId, aiInterpretationVersionId: aiVersionId })
      .expect(400);

    const created = await post(app, owner, base)
      .send({ diagnosticRunId, aiInterpretationVersionId: aiVersionId })
      .expect(201);
    const reportId = created.body.report.id as string;
    expect(created.body.report.versions[0].aiInterpretationVersionId).toBe(aiVersionId);
    expect(created.body.preview.aiNarrative).toMatchObject({
      isSimulated: true,
      summary: "Reviewed summary of the diagnostic.",
      provider: "mock",
    });
    expect(created.body.preview.disclosures).toEqual(
      expect.arrayContaining([
        DISCLOSURES.simulatedAi,
        "The interpretation text was edited by a reviewer.",
      ]),
    );

    // The narrative is frozen into the version: later corrections do not reach it.
    const rewritten = await post(app, owner, `${ai}/${aiRunId}/versions/${aiVersionId}/edit`)
      .send({ summary: "A later rewrite." })
      .expect(200);
    const rewrittenVersionId = rewritten.body.version.id as string;
    const published = await reviewAndPublish(owner, organizationId, reportId);
    expect(published.body.preview.aiNarrative.summary).toBe("Reviewed summary of the diagnostic.");
    expect(published.body.preview.aiNarrative.isSimulated).toBe(true);
    expect(published.body.preview.disclosures).toContain(DISCLOSURES.simulatedAi);
    // The narrative passed grounding at approval and again at publication.
    expect(
      (published.body.report.versions[0] as VersionSummary).disclosures?.groundingValidation,
    ).toMatchObject({ passed: true, criticalCount: 0 });

    // A new report version keeps the attached interpretation version, whose text
    // cannot change; a later correction is attached by naming its version, and
    // `null` detaches the interpretation.
    const kept = await post(app, owner, `${base}/${reportId}/versions`).send({}).expect(201);
    expect(kept.body.report.versions[0].aiInterpretationVersionId).toBe(aiVersionId);
    expect(kept.body.preview.aiNarrative.summary).toBe("Reviewed summary of the diagnostic.");
    const revised = await post(app, owner, `${base}/${reportId}/versions`)
      .send({ aiInterpretationVersionId: rewrittenVersionId })
      .expect(201);
    expect(revised.body.report.versions[0].aiInterpretationVersionId).toBe(rewrittenVersionId);
    expect(revised.body.preview.aiNarrative.summary).toBe("A later rewrite.");
    await post(app, owner, `${base}/${reportId}/submit-review`).send({}).expect(200);
    await post(app, owner, `${base}/${reportId}/reject`).send({}).expect(200);
    const detached = await post(app, owner, `${base}/${reportId}/versions`)
      .send({ aiInterpretationVersionId: null })
      .expect(201);
    expect(detached.body.preview.aiNarrative).toBeUndefined();
    expect(detached.body.report.versions[0].aiInterpretationVersionId).toBeNull();
  });

  it("lets an ADMIN approve and publish, denies a VIEWER, and audits approval, publication and download", async () => {
    const owner = await signUp(app, mail, "rep-roles");
    const organizationId = await createOrganization(app, owner, "rep-roles");
    const admin = await signUp(app, mail, "rep-roles-admin");
    await addMember(organizationId, admin.userId, "ADMIN");
    const viewer = await signUp(app, mail, "rep-roles-viewer");
    await addMember(organizationId, viewer.userId, "VIEWER");
    const outsider = await signUp(app, mail, "rep-roles-outsider");
    const otherOrganizationId = await createOrganization(app, outsider, "rep-roles-other");

    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: SCORABLE_STATEMENTS,
    });
    const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);
    const base = `/organizations/${organizationId}/reports`;
    const created = await post(app, owner, base).send({ diagnosticRunId }).expect(201);
    const reportId = created.body.report.id as string;
    const versionId = created.body.report.versions[0].id as string;
    const path = `${base}/${reportId}`;
    await post(app, owner, `${path}/submit-review`).send({}).expect(200);

    // A VIEWER holds no publication right at any step.
    for (const step of ["approve", "reject", "publish", `versions/${versionId}/render`]) {
      await post(app, viewer, `${path}/${step}`).send({}).expect(403);
    }
    // Workflow state and actor come from the session, never from the request body.
    await post(app, admin, `${path}/approve`)
      .send({ status: "APPROVED", actorUserId: owner.userId })
      .expect(400);
    await post(app, admin, `${path}/publish`).send({ verifiedPublication: true }).expect(400);
    // Another tenant cannot approve, directly or through its own organization.
    await post(app, outsider, `${path}/approve`).send({}).expect(404);
    await post(app, outsider, `/organizations/${otherOrganizationId}/reports/${reportId}/approve`)
      .send({})
      .expect(404);
    expect((await get(app, owner, path).expect(200)).body.report.status).toBe("REVIEW_REQUIRED");

    await post(app, admin, `${path}/approve`).send({ note: "Checked" }).expect(200);
    const published = await post(app, admin, `${path}/publish`).send({}).expect(200);
    expect(published.body.report).toMatchObject({ status: "PUBLISHED", verifiedPublication: true });
    const contentHash = (published.body.report.versions[0] as VersionSummary).contentHash;
    await download(app, viewer, `${path}/pdf`).expect(200);

    const audits = await prisma.auditEvent.findMany({
      where: { organizationId, entityType: "xray_report", entityId: reportId },
    });
    const auditLabels = audits.map((event) => `${event.action} by ${event.actorUserId}`).sort();
    expect(auditLabels).toEqual(
      expect.arrayContaining(
        [
          `report.created by ${owner.userId}`,
          `report.submitted_for_review by ${owner.userId}`,
          `report.approved by ${admin.userId}`,
          `report.published by ${admin.userId}`,
          `report.downloaded by ${viewer.userId}`,
          `report.publication_denied by ${viewer.userId}`,
        ].sort(),
      ),
    );
    expect(
      audits.filter(
        (event) =>
          event.action === "report.publication_denied" && event.actorUserId === viewer.userId,
      ).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      audits.find(
        (event) =>
          event.action === "report.publication_denied" && event.actorUserId === viewer.userId,
      )?.metadata,
    ).toMatchObject({
      failureCode: "MISSING_PERMISSION",
      failureClass: "PERMISSION",
    });
    const metadataOf = (action: string) =>
      audits.find((event) => event.action === action)?.metadata as Record<string, unknown>;
    expect(metadataOf("report.approved")).toMatchObject({
      versionId,
      from: "REVIEW_REQUIRED",
      to: "APPROVED",
    });
    expect(metadataOf("report.published")).toMatchObject({
      versionId,
      verifiedPublication: true,
      scoreStatus: "SCORED",
      contentHash,
    });
    expect(metadataOf("report.downloaded")).toMatchObject({ versionId });
    // Refused publication steps are on record (approve/reject/publish/render).
    const denied = await prisma.auditEvent.findMany({
      where: {
        organizationId,
        action: "report.publication_denied",
        actorUserId: viewer.userId,
      },
    });
    expect(denied.length).toBeGreaterThanOrEqual(4);
    expect(
      denied.every((event) => {
        const meta = event.metadata as {
          failureCode?: string;
          failureClass?: string;
          required?: string[];
        };
        return (
          meta.failureCode === "MISSING_PERMISSION" &&
          meta.failureClass === "PERMISSION" &&
          (meta.required ?? []).includes("xray:publish")
        );
      }),
    ).toBe(true);
  });

  it("refuses to publish on a forged or stale approval", async () => {
    const owner = await signUp(app, mail, "rep-forged");
    const organizationId = await createOrganization(app, owner, "rep-forged");
    const analyst = await signUp(app, mail, "rep-forged-analyst");
    await addMember(organizationId, analyst.userId, "ANALYST");
    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: SCORABLE_STATEMENTS,
    });
    const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);
    const base = `/organizations/${organizationId}/reports`;

    const expectNotPublished = async (reportId: string) => {
      const refused = await post(app, owner, `${base}/${reportId}/publish`).send({}).expect(409);
      expect(refused.body.code).toBe("APPROVAL_NOT_RECORDED");
      const detail = await get(app, owner, `${base}/${reportId}`).expect(200);
      expect(detail.body.report).toMatchObject({
        status: "APPROVED",
        verifiedPublication: false,
        publishedAt: null,
      });
      expect(
        (detail.body.report.versions as VersionSummary[]).every((v) => v.storageKey === null),
      ).toBe(true);
      expect(
        (detail.body.report.approvals as Array<{ action: string }>).map((a) => a.action),
      ).not.toContain("PUBLISH");
      await get(app, owner, `${base}/${reportId}/pdf`).expect(409);
      expect(
        await prisma.auditEvent.count({
          where: { organizationId, entityId: reportId, action: "report.published" },
        }),
      ).toBe(0);
    };

    // A status that says APPROVED with no review or approval behind it.
    const forged = await post(app, analyst, base).send({ diagnosticRunId }).expect(201);
    const forgedId = forged.body.report.id as string;
    const forgedVersionId = forged.body.report.versions[0].id as string;
    await prisma.xRayReport.update({ where: { id: forgedId }, data: { status: "APPROVED" } });
    await prisma.xRayReportVersion.update({
      where: { id: forgedVersionId },
      data: { status: "APPROVED" },
    });
    await expectNotPublished(forgedId);

    // The report row alone says APPROVED; its version is still a draft.
    const drifted = await post(app, analyst, base).send({ diagnosticRunId }).expect(201);
    const driftedId = drifted.body.report.id as string;
    await prisma.xRayReport.update({ where: { id: driftedId }, data: { status: "APPROVED" } });
    await expectNotPublished(driftedId);

    // A version that was approved and then rejected stays rejected, even if
    // its status is flipped back.
    const stale = await post(app, analyst, base).send({ diagnosticRunId }).expect(201);
    const staleId = stale.body.report.id as string;
    const firstVersionId = stale.body.report.versions[0].id as string;
    const stalePath = `${base}/${staleId}`;
    const forceApproved = async (versionId: string) => {
      await prisma.xRayReport.update({ where: { id: staleId }, data: { status: "APPROVED" } });
      await prisma.xRayReportVersion.update({
        where: { id: versionId },
        data: { status: "APPROVED" },
      });
    };
    await post(app, analyst, `${stalePath}/submit-review`).send({}).expect(200);
    await post(app, owner, `${stalePath}/approve`).send({}).expect(200);
    await post(app, owner, `${stalePath}/reject`).send({}).expect(200);
    await forceApproved(firstVersionId);
    await expectNotPublished(staleId);

    // An approval belongs to the version it was given for: the approval of
    // version 1 does not approve version 2.
    await post(app, owner, `${stalePath}/reject`).send({}).expect(200);
    const second = await post(app, analyst, `${stalePath}/versions`).send({}).expect(201);
    await forceApproved(second.body.report.versions[0].id as string);
    await expectNotPublished(staleId);

    // The way out is the normal one: reject, then review a new version.
    await post(app, owner, `${stalePath}/reject`).send({}).expect(200);
    await post(app, analyst, `${stalePath}/versions`).send({}).expect(201);
    const published = await reviewAndPublish(owner, organizationId, staleId);
    expect(published.body.report.status).toBe("PUBLISHED");
    expect(
      (published.body.report.versions as VersionSummary[]).map((v) => [v.versionNumber, v.status]),
    ).toEqual([
      [3, "PUBLISHED"],
      [2, "SUPERSEDED"],
      [1, "SUPERSEDED"],
    ]);
  });

  it("serves a PDF only for an intact, published version under the report's own storage prefix", async () => {
    const owner = await signUp(app, mail, "rep-store");
    const organizationId = await createOrganization(app, owner, "rep-store");
    const other = await signUp(app, mail, "rep-store-other");
    const otherOrganizationId = await createOrganization(app, other, "rep-store-other");
    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: SCORABLE_STATEMENTS,
    });
    const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);
    const base = `/organizations/${organizationId}/reports`;
    const storage = app.get<ObjectStoragePort>(OBJECT_STORAGE);
    const bucket = process.env.S3_DOCUMENTS_BUCKET ?? "opero-documents";

    // A replaced draft is SUPERSEDED but was never published: nothing to serve or regenerate.
    const draft = await post(app, owner, base).send({ diagnosticRunId }).expect(201);
    const draftId = draft.body.report.id as string;
    const replacedVersionId = draft.body.report.versions[0].id as string;
    const redrafted = await post(app, owner, `${base}/${draftId}/versions`).send({}).expect(201);
    expect(
      (redrafted.body.report.versions as VersionSummary[]).map((v) => [v.versionNumber, v.status]),
    ).toEqual([
      [2, "DRAFT"],
      [1, "SUPERSEDED"],
    ]);
    await get(app, owner, `${base}/${draftId}/pdf?versionId=${replacedVersionId}`).expect(409);
    await post(app, owner, `${base}/${draftId}/versions/${replacedVersionId}/render`)
      .send({})
      .expect(409);

    const published = await reviewAndPublish(owner, organizationId, draftId);
    const version = published.body.report.versions[0] as VersionSummary;
    const path = `${base}/${draftId}`;
    await download(app, owner, `${path}/pdf`).expect(200);
    // A version id of another report does not resolve through this one.
    const unrelated = await post(app, owner, base).send({ diagnosticRunId }).expect(201);
    await get(app, owner, `${base}/${unrelated.body.report.id}/pdf?versionId=${version.id}`).expect(
      409,
    );

    // The other tenant places an object of its own. The published version cannot
    // be re-pointed at it: its artifact columns are immutable in the database.
    const foreignBody = Buffer.from("%PDF-foreign");
    const foreignKey = `org/${otherOrganizationId}/reports/${draftId}/${version.id}.pdf`;
    await storage.putObject({
      bucket,
      key: foreignKey,
      body: foreignBody,
      contentType: "application/pdf",
    });
    await expect(
      prisma.xRayReportVersion.update({
        where: { id: version.id },
        data: { storageKey: foreignKey },
      }),
    ).rejects.toThrow(/immutable/);
    await download(app, owner, `${path}/pdf`).expect(200);

    // A row forged as published before it ever had an artifact gets no further:
    // a storage key outside the report's own prefix is refused.
    const unrelatedId = unrelated.body.report.id as string;
    await prisma.xRayReport.update({ where: { id: unrelatedId }, data: { status: "PUBLISHED" } });
    await prisma.xRayReportVersion.update({
      where: { id: unrelated.body.report.versions[0].id as string },
      data: {
        status: "PUBLISHED",
        storageKey: foreignKey,
        contentHash: createHash("sha256").update(foreignBody).digest("hex"),
        byteSize: foreignBody.length,
        disclosures: version.disclosures!,
      },
    });
    await get(app, owner, `${base}/${unrelatedId}/pdf`).expect(403);

    // Bytes that no longer match the published hash are not served.
    await storage.putObject({
      bucket,
      key: version.storageKey!,
      body: Buffer.from("%PDF-replaced"),
      contentType: "application/pdf",
    });
    const corrupt = await get(app, owner, `${path}/pdf`).expect(409);
    expect(corrupt.body.code).toBe("PUBLISHED_PDF_CORRUPT");
    expect(corrupt.body.message).toMatch(/integrity/);
    // Only the two successful downloads are on record.
    expect(
      await prisma.reportAccessEvent.count({
        where: { organizationId, reportId: draftId, action: "DOWNLOAD" },
      }),
    ).toBe(2);
    expect(
      await prisma.reportAccessEvent.count({
        where: { organizationId, reportId: unrelatedId, action: "DOWNLOAD" },
      }),
    ).toBe(0);
  });

  it("never attaches an interpretation that did not succeed or that belongs to another tenant", async () => {
    const owner = await signUp(app, mail, "rep-ai-failed");
    const organizationId = await createOrganization(app, owner, "rep-ai-failed");
    const other = await signUp(app, mail, "rep-ai-failed-other");
    const otherOrganizationId = await createOrganization(app, other, "rep-ai-failed-other");
    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: SCORABLE_STATEMENTS,
    });
    const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);
    const base = `/organizations/${organizationId}/reports`;
    const ai = `/organizations/${organizationId}/ai/interpretations`;

    const interpretation = await post(app, owner, ai).send({ diagnosticRunId }).expect(201);
    const aiRunId = interpretation.body.run.id as string;
    await executeAiInterpretation(
      prisma,
      { shareStructuredContext: true, providerEnv: { AI_PROVIDER: "mock" } },
      { organizationId, aiInterpretationRunId: aiRunId, actorUserId: owner.userId },
      { finalAttempt: true },
    );
    const aiVersionId = (await get(app, owner, `${ai}/${aiRunId}`).expect(200)).body.run.versions[0]
      .id as string;

    // Another tenant cannot pull this interpretation into a report of its own.
    const otherSeeded = await seedDocument({
      organizationId: otherOrganizationId,
      userId: other.userId,
      statements: SCORABLE_STATEMENTS,
    });
    const otherRunId = await runDiagnostic(app, other, otherOrganizationId, [
      otherSeeded.documentId,
    ]);
    await post(app, other, `/organizations/${otherOrganizationId}/reports`)
      .send({ diagnosticRunId: otherRunId, aiInterpretationVersionId: aiVersionId })
      .expect(400);
    expect(await prisma.xRayReport.count({ where: { organizationId: otherOrganizationId } })).toBe(
      0,
    );

    const attached = await post(app, owner, base)
      .send({ diagnosticRunId, aiInterpretationVersionId: aiVersionId })
      .expect(201);
    const attachedPath = `${base}/${attached.body.report.id as string}`;

    // Text left behind by a run that is not SUCCEEDED is never attached.
    for (const status of ["FAILED", "UNAVAILABLE", "RUNNING", "QUEUED"] as const) {
      await prisma.aIInterpretationRun.update({ where: { id: aiRunId }, data: { status } });
      await post(app, owner, base)
        .send({ diagnosticRunId, aiInterpretationVersionId: aiVersionId })
        .expect(400);
      // A new version does not silently carry the attachment forward either.
      await post(app, owner, `${attachedPath}/versions`).send({}).expect(400);
    }
    expect(await prisma.xRayReport.count({ where: { organizationId } })).toBe(1);
    expect(
      (await get(app, owner, attachedPath).expect(200)).body.report.versions,
    ).toHaveLength(1);

    // A failed interpretation never blocks the report itself: it publishes without AI.
    const detached = await post(app, owner, `${attachedPath}/versions`)
      .send({ aiInterpretationVersionId: null })
      .expect(201);
    expect(detached.body.preview.aiNarrative).toBeUndefined();
    const published = await reviewAndPublish(owner, organizationId, attached.body.report.id);
    expect(published.body.report.status).toBe("PUBLISHED");
    expect(published.body.preview.aiNarrative).toBeUndefined();
    expect(published.body.report.versions[0].aiInterpretationVersionId).toBeNull();
  });
});
