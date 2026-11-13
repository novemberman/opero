/**
 * Phase 6B publication integrity: critical AI grounding blocks approval and
 * publication, and a published PDF is immutable and served only when intact.
 *
 * Real services: Nest HTTP API, Prisma/Postgres (including the artifact
 * immutability trigger), Redis (queue registration), in-process diagnostic
 * engine, pdfkit PDF, memory object storage.
 * Stand-ins: the AI provider is a local fake that returns a fixed narrative,
 * so no network is used.
 */
import { ConflictException, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  GROUNDING_VALIDATION_VERSION,
  PROMPT_VERSION,
  type AiInterpretationResult,
} from "@opero/ai";
import { ObjectAlreadyExistsError, type ObjectStoragePort } from "@opero/object-storage";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeAiInterpretation } from "../ai/run-ai-interpretation-job";
import { OBJECT_STORAGE } from "../storage/storage.constants";
import { createTestApp } from "../testing/app-factory";
import type { MemoryEmailService } from "../testing/memory-email.service";
import {
  SCORABLE_STATEMENTS,
  addMember,
  cleanupPhase6,
  createOrganization,
  get,
  grantXrayProAccess,
  post,
  resetDatabase,
  runDiagnostic,
  seedDocument,
  signUp,
  testPrisma,
  type TestSession,
} from "../testing/phase6-fixtures";
import { reportStorageKey } from "./report-payload";
import { ReportsService } from "./reports.service";

type Narrative = AiInterpretationResult["narrative"];

type GroundingValidation = {
  version: string;
  validatedAt: string;
  passed: boolean;
  criticalCount: number;
  highCount: number;
  unsupportedClaimCount: number;
  criticalViolations: Array<{
    text: string;
    reasons: string[];
    severity: string;
    section?: string;
    unsupportedNumbers?: string[];
  }>;
};

type VersionSummary = {
  id: string;
  versionNumber: number;
  status: string;
  aiInterpretationVersionId: string | null;
  storageKey: string | null;
  contentHash: string | null;
  byteSize: number | null;
  disclosures: {
    verifiedPublication?: boolean;
    generatedAt?: string;
    groundingValidation?: GroundingValidation | null;
  } | null;
};

type Flag = { section?: string; reasons: string[]; unsupportedNumbers?: string[] };

type Report = { reportId: string; versionId: string; path: string };

const INVENTED_REVENUE = "Revenue will reach 2,000,000 next year.";
const INVENTED_GROWTH = "Revenue grew 500% year on year.";
const WRONG_NET_MARGIN = "Net margin is 0.987654.";

function sha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

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

describe("Phase 6B publication integrity", () => {
  let app: INestApplication;
  let mail: MemoryEmailService;
  let storage: ObjectStoragePort;
  let bucket: string;
  let owner: TestSession;
  let viewer: TestSession;
  let outsider: TestSession;
  let organizationId: string;
  let otherOrganizationId: string;
  let diagnosticRunId: string;
  /** NET_MARGIN exactly as the engine stored it. */
  let netMargin: string;
  let base: string;
  let ai: string;
  const prisma = testPrisma();

  /** A narrative whose every statement is backed by the diagnostic facts. */
  function groundedNarrative(overrides: Partial<Narrative> = {}): Narrative {
    return {
      summary: "Profitability was assessed from the reviewed statements.",
      keyObservations: [`Net margin is ${netMargin}.`],
      risks: [],
      limitations: ["Conclusions are limited to the reviewed statements."],
      claims: [
        {
          text: `Net margin is ${netMargin}.`,
          groundedMetricCodes: ["NET_MARGIN"],
          groundedFindingIds: [],
        },
      ],
      ...overrides,
    };
  }

  /** Stores an interpretation version whose text is exactly `narrative`. */
  async function interpret(narrative: Narrative): Promise<{ aiRunId: string; aiVersionId: string }> {
    const created = await post(app, owner, ai).send({ diagnosticRunId }).expect(201);
    const aiRunId = created.body.run.id as string;
    const outcome = await executeAiInterpretation(
      prisma,
      {
        shareStructuredContext: true,
        providerEnv: {},
        // Stand-in for a live model. Never performs I/O.
        createProvider: () => ({
          name: "openai",
          async interpret() {
            return {
              narrative,
              provider: "openai",
              model: "fake-live-model",
              promptVersion: PROMPT_VERSION,
              isSimulated: false,
            };
          },
        }),
      },
      { organizationId, aiInterpretationRunId: aiRunId, actorUserId: owner.userId },
      { finalAttempt: true },
    );
    expect(outcome).toBe("SUCCEEDED");
    const version = await prisma.aIInterpretationVersion.findFirstOrThrow({
      where: { aiInterpretationRunId: aiRunId },
    });
    return { aiRunId, aiVersionId: version.id };
  }

  async function flagsOf(aiVersionId: string): Promise<Flag[]> {
    const version = await prisma.aIInterpretationVersion.findUniqueOrThrow({
      where: { id: aiVersionId },
    });
    return version.unsupportedClaims as Flag[];
  }

  async function createReport(aiInterpretationVersionId?: string): Promise<Report> {
    const created = await post(app, owner, base)
      .send({ diagnosticRunId, ...(aiInterpretationVersionId ? { aiInterpretationVersionId } : {}) })
      .expect(201);
    const reportId = created.body.report.id as string;
    return {
      reportId,
      versionId: created.body.report.versions[0].id as string,
      path: `${base}/${reportId}`,
    };
  }

  /** A draft with the narrative attached, submitted and waiting for a decision. */
  async function reportInReview(
    narrative: Narrative,
  ): Promise<Report & { aiRunId: string; aiVersionId: string }> {
    const interpretation = await interpret(narrative);
    const report = await createReport(interpretation.aiVersionId);
    await post(app, owner, `${report.path}/submit-review`).send({}).expect(200);
    return { ...report, ...interpretation };
  }

  async function approvedReport(aiInterpretationVersionId?: string): Promise<Report> {
    const report = await createReport(aiInterpretationVersionId);
    await post(app, owner, `${report.path}/submit-review`).send({}).expect(200);
    await post(app, owner, `${report.path}/approve`).send({}).expect(200);
    return report;
  }

  async function currentVersion(report: Pick<Report, "path">): Promise<VersionSummary> {
    const detail = await get(app, owner, report.path).expect(200);
    return detail.body.report.versions[0] as VersionSummary;
  }

  async function publishedReport(): Promise<Report & { version: VersionSummary }> {
    const report = await approvedReport();
    await post(app, owner, `${report.path}/publish`).send({}).expect(200);
    await grantXrayProAccess(prisma, organizationId, report.reportId);
    return { ...report, version: await currentVersion(report) };
  }

  /**
   * Writes an approval straight into the database, as if the approval step
   * had been skipped or predated the grounding gate.
   */
  async function forgeApproval(report: Report): Promise<void> {
    await prisma.xRayReport.update({ where: { id: report.reportId }, data: { status: "APPROVED" } });
    await prisma.xRayReportVersion.update({
      where: { id: report.versionId },
      data: { status: "APPROVED" },
    });
    await prisma.reportApproval.create({
      data: {
        organizationId,
        reportId: report.reportId,
        reportVersionId: report.versionId,
        actorUserId: owner.userId,
        action: "APPROVE",
        note: "Written directly to the database",
      },
    });
  }

  async function expectBlocked(
    response: { body: Record<string, unknown> },
    stage: "approve" | "publish",
  ): Promise<GroundingValidation> {
    expect(response.body.code).toBe("CRITICAL_GROUNDING_VIOLATIONS");
    expect(response.body.message).toContain(`block ${stage}`);
    const validation = response.body.groundingValidation as GroundingValidation;
    expect(validation.version).toBe(GROUNDING_VALIDATION_VERSION);
    expect(validation.passed).toBe(false);
    expect(validation.criticalCount).toBeGreaterThan(0);
    expect(validation.criticalViolations).toHaveLength(validation.criticalCount);
    expect(validation.criticalViolations.every((v) => v.severity === "CRITICAL")).toBe(true);
    return validation;
  }

  /** Nothing about the report says it was published, and no PDF exists for it. */
  async function expectNotPublished(report: Report, status: string): Promise<void> {
    const detail = await get(app, owner, report.path).expect(200);
    expect(detail.body.report).toMatchObject({
      status,
      verifiedPublication: false,
      publishedAt: null,
    });
    const version = (detail.body.report.versions as VersionSummary[]).find(
      (v) => v.id === report.versionId,
    );
    expect(version).toMatchObject({ status, storageKey: null, contentHash: null, byteSize: null });
    expect(
      (detail.body.report.approvals as Array<{ action: string }>).map((a) => a.action),
    ).not.toContain("PUBLISH");
    await expect(
      storage.headObject({
        bucket,
        key: reportStorageKey(organizationId, report.reportId, report.versionId),
      }),
    ).rejects.toThrow();
    await get(app, owner, `${report.path}/pdf`).expect(409);
    expect(
      await prisma.auditEvent.count({
        where: { organizationId, entityId: report.reportId, action: "report.published" },
      }),
    ).toBe(0);
  }

  async function integrityAudits(reportId: string) {
    return prisma.auditEvent.findMany({
      where: { organizationId, entityId: reportId, action: "report.pdf_integrity_failed" },
      orderBy: { createdAt: "asc" },
    });
  }

  async function downloadCount(reportId: string): Promise<number> {
    return prisma.reportAccessEvent.count({
      where: { organizationId, reportId, action: "DOWNLOAD" },
    });
  }

  beforeAll(async () => {
    await resetDatabase();
    ({ app, mail } = await createTestApp());
    storage = app.get<ObjectStoragePort>(OBJECT_STORAGE);
    bucket = app.get(ConfigService).get<string>("S3_DOCUMENTS_BUCKET")!;

    owner = await signUp(app, mail, "p6b-owner");
    organizationId = await createOrganization(app, owner, "p6b");
    viewer = await signUp(app, mail, "p6b-viewer");
    await addMember(organizationId, viewer.userId, "VIEWER");
    outsider = await signUp(app, mail, "p6b-outsider");
    otherOrganizationId = await createOrganization(app, outsider, "p6b-other");

    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: SCORABLE_STATEMENTS,
    });
    diagnosticRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);
    const metric = await prisma.financialMetric.findFirstOrThrow({
      where: { organizationId, diagnosticRunId, code: "NET_MARGIN" },
    });
    expect(metric.status).toBe("COMPUTED");
    netMargin = String(metric.value);

    base = `/organizations/${organizationId}/reports`;
    ai = `/organizations/${organizationId}/ai/interpretations`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await cleanupPhase6(app);
    await app.close();
  });

  it("blocks approval and publication when an AI claim quotes an unsupported figure", async () => {
    const report = await reportInReview(
      groundedNarrative({
        claims: [{ text: INVENTED_REVENUE, groundedMetricCodes: [], groundedFindingIds: [] }],
      }),
    );
    expect(await flagsOf(report.aiVersionId)).toEqual([
      expect.objectContaining({
        reasons: ["NO_REFERENCES", "UNSUPPORTED_NUMBER"],
        unsupportedNumbers: ["2,000,000"],
      }),
    ]);

    const refused = await post(app, owner, `${report.path}/approve`).send({}).expect(409);
    const validation = await expectBlocked(refused, "approve");
    expect(validation.criticalViolations).toEqual([
      {
        text: INVENTED_REVENUE,
        reasons: ["NO_REFERENCES", "UNSUPPORTED_NUMBER"],
        severity: "CRITICAL",
        unsupportedNumbers: ["2,000,000"],
      },
    ]);

    // The refusal changes nothing: no decision is recorded and the report stays in review.
    expect(
      await prisma.reportApproval.count({
        where: { reportId: report.reportId, action: "APPROVE" },
      }),
    ).toBe(0);
    expect(
      await prisma.auditEvent.count({
        where: {
          organizationId,
          entityId: report.reportId,
          action: { in: ["report.approved", "report.grounding_validated"] },
        },
      }),
    ).toBe(0);
    const unapproved = await post(app, owner, `${report.path}/publish`).send({}).expect(409);
    expect(unapproved.body.message).toMatch(/only an APPROVED report/);
    await expectNotPublished(report, "REVIEW_REQUIRED");

    // Publication checks the narrative itself, so an approval that reached the
    // database without passing the gate does not get the report out either.
    await forgeApproval(report);
    const blocked = await post(app, owner, `${report.path}/publish`).send({}).expect(409);
    expect((await expectBlocked(blocked, "publish")).criticalViolations).toEqual(
      validation.criticalViolations,
    );
    await expectNotPublished(report, "APPROVED");
  });

  it("blocks publication when an AI claim contradicts a computed metric", async () => {
    const report = await reportInReview(
      groundedNarrative({
        claims: [
          { text: WRONG_NET_MARGIN, groundedMetricCodes: ["NET_MARGIN"], groundedFindingIds: [] },
        ],
      }),
    );
    // Every reference resolves; only the figure disagrees with the diagnostic.
    expect(await flagsOf(report.aiVersionId)).toEqual([
      expect.objectContaining({
        reasons: ["UNSUPPORTED_NUMBER", "CONTRADICTORY_NUMBER"],
        unknownMetricCodes: [],
        unsupportedNumbers: ["0.987654"],
      }),
    ]);

    const refused = await post(app, owner, `${report.path}/approve`).send({}).expect(409);
    const contradiction = {
      text: WRONG_NET_MARGIN,
      reasons: ["UNSUPPORTED_NUMBER", "CONTRADICTORY_NUMBER"],
      severity: "CRITICAL",
      unsupportedNumbers: ["0.987654"],
    };
    expect((await expectBlocked(refused, "approve")).criticalViolations).toEqual([contradiction]);
    await expectNotPublished(report, "REVIEW_REQUIRED");

    await forgeApproval(report);
    const blocked = await post(app, owner, `${report.path}/publish`).send({}).expect(409);
    expect((await expectBlocked(blocked, "publish")).criticalViolations).toEqual([contradiction]);
    await expectNotPublished(report, "APPROVED");

    // The same narrative with the real value is publishable.
    const { aiVersionId } = await interpret(groundedNarrative());
    expect(await flagsOf(aiVersionId)).toEqual([]);
    const clean = await approvedReport(aiVersionId);
    await post(app, owner, `${clean.path}/publish`).send({}).expect(200);
  });

  it("lets a reviewer correction through as a new interpretation version that is validated again", async () => {
    const report = await reportInReview(
      groundedNarrative({ summary: `Profitability was assessed. ${INVENTED_GROWTH}` }),
    );
    expect(await flagsOf(report.aiVersionId)).toEqual([
      expect.objectContaining({
        section: "summary",
        text: INVENTED_GROWTH,
        reasons: ["UNSUPPORTED_NUMBER"],
        unsupportedNumbers: ["500"],
      }),
    ]);
    const refused = await post(app, owner, `${report.path}/approve`).send({}).expect(409);
    expect((await expectBlocked(refused, "approve")).criticalViolations).toEqual([
      {
        text: INVENTED_GROWTH,
        reasons: ["UNSUPPORTED_NUMBER"],
        severity: "CRITICAL",
        section: "summary",
        unsupportedNumbers: ["500"],
      },
    ]);

    // The reviewer removes the invented figure. That yields a new interpretation version.
    const { aiRunId } = report;
    const corrected = await post(app, owner, `${ai}/${aiRunId}/versions/${report.aiVersionId}/edit`)
      .send({ summary: "Profitability was assessed from the reviewed statements." })
      .expect(200);
    const correctedVersionId = corrected.body.version.id as string;
    expect(correctedVersionId).not.toBe(report.aiVersionId);
    expect(corrected.body.version).toMatchObject({
      versionNumber: 2,
      editedByUserId: owner.userId,
      unsupportedClaims: [],
    });
    const correction = await prisma.auditEvent.findFirstOrThrow({
      where: { organizationId, action: "ai.interpretation_corrected", entityId: correctedVersionId },
    });
    expect(correction.actorUserId).toBe(owner.userId);
    expect(correction.metadata).toMatchObject({
      aiInterpretationRunId: aiRunId,
      priorVersionId: report.aiVersionId,
      editedFields: ["summary"],
      groundingVersion: GROUNDING_VALIDATION_VERSION,
      criticalCount: 0,
      passed: true,
    });

    // The report version under review still holds the old text and stays blocked.
    await post(app, owner, `${report.path}/approve`).send({}).expect(409);
    await post(app, owner, `${report.path}/versions`)
      .send({ aiInterpretationVersionId: correctedVersionId })
      .expect(409);

    // Reject it, attach the correction to a new report version and review again.
    await post(app, owner, `${report.path}/reject`).send({}).expect(200);
    const revised = await post(app, owner, `${report.path}/versions`)
      .send({ aiInterpretationVersionId: correctedVersionId })
      .expect(201);
    const revisedVersionId = revised.body.report.versions[0].id as string;
    expect(revised.body.report.versions[0]).toMatchObject({
      versionNumber: 2,
      status: "DRAFT",
      aiInterpretationVersionId: correctedVersionId,
    });
    expect(revised.body.preview.aiNarrative.summary).toBe(
      "Profitability was assessed from the reviewed statements.",
    );
    expect(revised.body.preview.disclosures).toContain(
      "The interpretation text was edited by a reviewer.",
    );

    await post(app, owner, `${report.path}/submit-review`).send({}).expect(200);
    const approved = await post(app, owner, `${report.path}/approve`).send({}).expect(200);
    expect(approved.body.report.status).toBe("APPROVED");
    const validated = await prisma.auditEvent.findFirstOrThrow({
      where: { organizationId, entityId: report.reportId, action: "report.grounding_validated" },
    });
    expect(validated.metadata).toEqual({
      versionId: revisedVersionId,
      stage: "approve",
      groundingVersion: GROUNDING_VALIDATION_VERSION,
      passed: true,
      criticalCount: 0,
    });

    const published = await post(app, owner, `${report.path}/publish`).send({}).expect(200);
    await grantXrayProAccess(prisma, organizationId, report.reportId);
    expect(published.body.report.status).toBe("PUBLISHED");
    const versions = published.body.report.versions as VersionSummary[];
    expect(versions.map((v) => [v.versionNumber, v.status, v.aiInterpretationVersionId])).toEqual([
      [2, "PUBLISHED", correctedVersionId],
      [1, "SUPERSEDED", report.aiVersionId],
    ]);
    // The validation of the exact published narrative is kept with the publication.
    expect(versions[0]!.disclosures?.groundingValidation).toMatchObject({
      version: GROUNDING_VALIDATION_VERSION,
      passed: true,
      criticalCount: 0,
      criticalViolations: [],
    });
    const publication = await prisma.auditEvent.findFirstOrThrow({
      where: { organizationId, entityId: report.reportId, action: "report.published" },
    });
    expect(publication.metadata).toMatchObject({
      versionId: revisedVersionId,
      groundingVersion: GROUNDING_VALIDATION_VERSION,
      groundingPassed: true,
      contentHash: versions[0]!.contentHash,
    });
    const pdf = await download(app, viewer, `${report.path}/pdf`).expect(200);
    expect(sha256(pdf.body as Buffer)).toBe(versions[0]!.contentHash);

    // Neither the generated interpretation nor the rejected report version was rewritten.
    const original = await prisma.aIInterpretationVersion.findUniqueOrThrow({
      where: { id: report.aiVersionId },
    });
    expect(original.editedNarrative).toBeNull();
    expect((original.narrative as Narrative).summary).toContain(INVENTED_GROWTH);
    const rejected = await get(app, owner, `${report.path}/versions/${report.versionId}`).expect(200);
    expect(rejected.body.version.snapshotPayload.aiNarrative.narrative.summary).toContain(
      INVENTED_GROWTH,
    );
    expect(rejected.body.version.storageKey).toBeNull();
  });

  it("does not let human approval or tampered records override a critical grounding violation", async () => {
    const report = await reportInReview(
      groundedNarrative({
        claims: [
          { text: WRONG_NET_MARGIN, groundedMetricCodes: ["NET_MARGIN"], groundedFindingIds: [] },
        ],
      }),
    );

    // An approver cannot wave the violation through, with a note or with extra fields.
    const insisted = await post(app, owner, `${report.path}/approve`)
      .send({ note: "Reviewed by the approver; publish as is." })
      .expect(409);
    await expectBlocked(insisted, "approve");
    await post(app, owner, `${report.path}/approve`)
      .send({ overrideGrounding: true, groundingValidation: { passed: true, criticalCount: 0 } })
      .expect(400);
    await expectNotPublished(report, "REVIEW_REQUIRED");

    // A forged approval together with a forged "passed" validation record and a
    // zeroed flag count: publication validates the narrative itself.
    const forgedValidation: GroundingValidation = {
      version: GROUNDING_VALIDATION_VERSION,
      validatedAt: new Date().toISOString(),
      passed: true,
      criticalCount: 0,
      highCount: 0,
      unsupportedClaimCount: 0,
      criticalViolations: [],
    };
    const stored = await prisma.xRayReportVersion.findUniqueOrThrow({
      where: { id: report.versionId },
    });
    const payload = structuredClone(stored.snapshotPayload) as {
      aiNarrative: { unsupportedClaimCount: number; narrative: { summary: string } };
    };
    payload.aiNarrative.unsupportedClaimCount = 0;
    await prisma.xRayReportVersion.update({
      where: { id: report.versionId },
      data: { snapshotPayload: payload, disclosures: { groundingValidation: forgedValidation } },
    });
    await forgeApproval(report);
    const blocked = await post(app, owner, `${report.path}/publish`).send({}).expect(409);
    expect((await expectBlocked(blocked, "publish")).criticalViolations).toEqual([
      expect.objectContaining({
        text: WRONG_NET_MARGIN,
        reasons: ["UNSUPPORTED_NUMBER", "CONTRADICTORY_NUMBER"],
      }),
    ]);
    await expectNotPublished(report, "APPROVED");

    // A genuine approval covers the text that was approved, not text swapped in afterwards.
    const { aiVersionId } = await interpret(groundedNarrative());
    const genuine = await approvedReport(aiVersionId);
    expect((await currentVersion(genuine)).disclosures?.groundingValidation).toMatchObject({
      passed: true,
      criticalCount: 0,
    });
    const approvedRow = await prisma.xRayReportVersion.findUniqueOrThrow({
      where: { id: genuine.versionId },
    });
    const swapped = structuredClone(approvedRow.snapshotPayload) as typeof payload;
    swapped.aiNarrative.narrative.summary = INVENTED_GROWTH;
    await prisma.xRayReportVersion.update({
      where: { id: genuine.versionId },
      data: { snapshotPayload: swapped },
    });
    const swappedOut = await post(app, owner, `${genuine.path}/publish`).send({}).expect(409);
    expect((await expectBlocked(swappedOut, "publish")).criticalViolations).toEqual([
      expect.objectContaining({ section: "summary", unsupportedNumbers: ["500"] }),
    ]);
    await expectNotPublished(genuine, "APPROVED");
  });

  it("keeps a published PDF and its record immutable", async () => {
    const report = await publishedReport();
    const { version } = report;
    const key = reportStorageKey(organizationId, report.reportId, report.versionId);
    expect(version).toMatchObject({ status: "PUBLISHED", storageKey: key });
    const original = await storage.getObjectBuffer({ bucket, key });
    expect(sha256(original)).toBe(version.contentHash);
    expect(original.length).toBe(version.byteSize);

    // The object is written without overwrite, so a second write fails.
    await expect(
      storage.putObject({
        bucket,
        key,
        body: Buffer.from("%PDF-replacement"),
        contentType: "application/pdf",
        overwrite: false,
      }),
    ).rejects.toBeInstanceOf(ObjectAlreadyExistsError);

    // Publishing again and regenerating are both refused.
    const again = await post(app, owner, `${report.path}/publish`).send({}).expect(409);
    expect(again.body.message).toMatch(/immutable/);
    const render = await post(app, owner, `${report.path}/versions/${report.versionId}/render`)
      .send({})
      .expect(409);
    expect(render.body.code).toBe("PUBLISHED_PDF_IMMUTABLE");
    const rejection = await prisma.auditEvent.findFirstOrThrow({
      where: {
        organizationId,
        entityId: report.reportId,
        action: "report.pdf_regenerate_rejected",
      },
    });
    expect(rejection.actorUserId).toBe(owner.userId);
    expect(rejection.metadata).toEqual({
      versionId: report.versionId,
      contentHash: version.contentHash,
    });

    // The database refuses to change the artifact columns or the frozen content.
    const tamperings = [
      { storageKey: `org/${organizationId}/reports/${report.reportId}/other.pdf` },
      { contentHash: sha256(Buffer.from("%PDF-replacement")) },
      { byteSize: 1 },
      { snapshotPayload: { schemaVersion: 1, title: "Rewritten" } },
    ];
    for (const data of tamperings) {
      await expect(
        prisma.xRayReportVersion.update({ where: { id: report.versionId }, data }),
      ).rejects.toThrow(/immutable/);
    }

    // The same holds once a newer version has superseded it.
    const revised = await post(app, owner, `${report.path}/versions`).send({}).expect(201);
    const secondVersionId = revised.body.report.versions[0].id as string;
    await post(app, owner, `${report.path}/submit-review`).send({}).expect(200);
    await post(app, owner, `${report.path}/approve`).send({}).expect(200);
    const republished = await post(app, owner, `${report.path}/publish`).send({}).expect(200);
    await grantXrayProAccess(prisma, organizationId, report.reportId);
    const versions = republished.body.report.versions as VersionSummary[];
    expect(versions.map((v) => [v.versionNumber, v.status])).toEqual([
      [2, "PUBLISHED"],
      [1, "SUPERSEDED"],
    ]);
    expect(versions[0]!.storageKey).toBe(
      reportStorageKey(organizationId, report.reportId, secondVersionId),
    );
    await expect(
      prisma.xRayReportVersion.update({
        where: { id: report.versionId },
        data: { contentHash: versions[0]!.contentHash },
      }),
    ).rejects.toThrow(/immutable/);

    // Nothing above touched the first PDF or its record.
    expect(versions[1]).toMatchObject({
      id: report.versionId,
      storageKey: key,
      contentHash: version.contentHash,
      byteSize: version.byteSize,
    });
    expect((await storage.getObjectBuffer({ bucket, key })).equals(original)).toBe(true);
    const superseded = await download(
      app,
      viewer,
      `${report.path}/pdf?versionId=${report.versionId}`,
    ).expect(200);
    expect((superseded.body as Buffer).equals(original)).toBe(true);
  });

  it("refuses to publish over an object that already exists at the version's key", async () => {
    const report = await approvedReport();
    const key = reportStorageKey(organizationId, report.reportId, report.versionId);
    const existing = Buffer.from("%PDF-written-by-an-earlier-publisher");
    await storage.putObject({ bucket, key, body: existing, contentType: "application/pdf" });

    const refused = await post(app, owner, `${report.path}/publish`).send({}).expect(409);
    expect(refused.body.code).toBe("PUBLISHED_ARTIFACT_EXISTS");

    // The object is left as it was and the publication is rolled back as a whole.
    expect((await storage.getObjectBuffer({ bucket, key })).equals(existing)).toBe(true);
    const detail = await get(app, owner, report.path).expect(200);
    expect(detail.body.report).toMatchObject({
      status: "APPROVED",
      verifiedPublication: false,
      publishedAt: null,
    });
    expect(detail.body.report.versions[0]).toMatchObject({
      status: "APPROVED",
      storageKey: null,
      contentHash: null,
      byteSize: null,
    });
    expect(
      (detail.body.report.approvals as Array<{ action: string }>).map((a) => a.action),
    ).toEqual(["SUBMIT_REVIEW", "APPROVE"]);
    expect(
      await prisma.auditEvent.count({
        where: { organizationId, entityId: report.reportId, action: "report.published" },
      }),
    ).toBe(0);
    // The stray object is never served as the report.
    await get(app, owner, `${report.path}/pdf`).expect(409);

    // A new version has a key of its own and publishes normally.
    await post(app, owner, `${report.path}/reject`).send({}).expect(200);
    await post(app, owner, `${report.path}/versions`).send({}).expect(201);
    await post(app, owner, `${report.path}/submit-review`).send({}).expect(200);
    await post(app, owner, `${report.path}/approve`).send({}).expect(200);
    const published = await post(app, owner, `${report.path}/publish`).send({}).expect(200);
    await grantXrayProAccess(prisma, organizationId, report.reportId);
    const latest = published.body.report.versions[0] as VersionSummary;
    expect(latest.storageKey).not.toBe(key);
    const pdf = await download(app, owner, `${report.path}/pdf`).expect(200);
    expect(sha256(pdf.body as Buffer)).toBe(latest.contentHash);
    expect((await storage.getObjectBuffer({ bucket, key })).equals(existing)).toBe(true);
  });

  it("fails closed with PUBLISHED_PDF_MISSING when the published object is gone", async () => {
    const report = await publishedReport();
    const { version } = report;
    const key = version.storageKey!;
    await storage.deleteObject({ bucket, key });

    const missing = await get(app, viewer, `${report.path}/pdf`).expect(409);
    expect(missing.body.code).toBe("PUBLISHED_PDF_MISSING");
    expect(missing.headers["content-type"]).toMatch(/application\/json/);

    const audits = await integrityAudits(report.reportId);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      entityType: "xray_report",
      actorUserId: viewer.userId,
      requestId: missing.headers["x-request-id"],
    });
    expect(audits[0]!.metadata).toEqual({
      versionId: report.versionId,
      reason: "MISSING_OBJECT",
      storageKey: key,
      expectedHash: version.contentHash,
    });
    expect(await downloadCount(report.reportId)).toBe(0);
    expect(
      await prisma.auditEvent.count({
        where: { organizationId, entityId: report.reportId, action: "report.downloaded" },
      }),
    ).toBe(0);

    // Nothing is rendered in its place, on download or on request.
    await expect(storage.headObject({ bucket, key })).rejects.toThrow();
    const render = await post(app, owner, `${report.path}/versions/${report.versionId}/render`)
      .send({})
      .expect(409);
    expect(render.body.code).toBe("PUBLISHED_PDF_IMMUTABLE");
    await expect(storage.headObject({ bucket, key })).rejects.toThrow();
    expect(await currentVersion(report)).toMatchObject({
      status: "PUBLISHED",
      storageKey: key,
      contentHash: version.contentHash,
      byteSize: version.byteSize,
    });

    // The replacement is a new version; the lost one stays unavailable.
    await post(app, owner, `${report.path}/versions`).send({}).expect(201);
    await post(app, owner, `${report.path}/submit-review`).send({}).expect(200);
    await post(app, owner, `${report.path}/approve`).send({}).expect(200);
    await post(app, owner, `${report.path}/publish`).send({}).expect(200);
    await grantXrayProAccess(prisma, organizationId, report.reportId);
    const replacement = await download(app, viewer, `${report.path}/pdf`).expect(200);
    expect(replacement.headers["content-disposition"]).toContain("opero-xray-report-v2.pdf");
    const lost = await get(app, viewer, `${report.path}/pdf?versionId=${report.versionId}`).expect(
      409,
    );
    expect(lost.body.code).toBe("PUBLISHED_PDF_MISSING");
    expect(await integrityAudits(report.reportId)).toHaveLength(2);
  });

  it("fails closed with PUBLISHED_PDF_CORRUPT when the published object no longer matches its hash", async () => {
    const report = await publishedReport();
    const { version } = report;
    const key = version.storageKey!;
    const intact = await download(app, viewer, `${report.path}/pdf`).expect(200);
    const original = intact.body as Buffer;
    expect(sha256(original)).toBe(version.contentHash);

    // Storage is changed behind the application's back.
    const altered = Buffer.concat([original, Buffer.from("\n% appended")]);
    await storage.putObject({ bucket, key, body: altered, contentType: "application/pdf" });

    const corrupt = await get(app, viewer, `${report.path}/pdf`).expect(409);
    expect(corrupt.body.code).toBe("PUBLISHED_PDF_CORRUPT");
    expect(corrupt.headers["content-type"]).toMatch(/application\/json/);

    const audits = await integrityAudits(report.reportId);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      entityType: "xray_report",
      actorUserId: viewer.userId,
      requestId: corrupt.headers["x-request-id"],
    });
    expect(audits[0]!.metadata).toEqual({
      versionId: report.versionId,
      reason: "HASH_MISMATCH",
      storageKey: key,
      expectedHash: version.contentHash,
      actualHash: sha256(altered),
    });
    // Only the download of the intact file is on record.
    expect(await downloadCount(report.reportId)).toBe(1);

    // The altered object is neither served nor quietly replaced, and the record is unchanged.
    expect((await storage.getObjectBuffer({ bucket, key })).equals(altered)).toBe(true);
    expect(await currentVersion(report)).toMatchObject({
      status: "PUBLISHED",
      contentHash: version.contentHash,
      byteSize: version.byteSize,
    });
    await get(app, owner, `${report.path}/pdf?versionId=${report.versionId}`).expect(409);
    expect(await integrityAudits(report.reportId)).toHaveLength(2);

    // Once the original bytes are back the file is served again.
    await storage.putObject({ bucket, key, body: original, contentType: "application/pdf" });
    const restored = await download(app, viewer, `${report.path}/pdf`).expect(200);
    expect((restored.body as Buffer).equals(original)).toBe(true);
    expect(await downloadCount(report.reportId)).toBe(2);
  });

  it("publishes exactly once when publication is requested concurrently", async () => {
    const report = await approvedReport();
    const reports = app.get(ReportsService);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } });
    const actor = {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerifiedAt: user.emailVerifiedAt,
    };

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        reports.publish({ organizationId, reportId: report.reportId, actor }),
      ),
    );

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const failures = attempts.flatMap((attempt) =>
      attempt.status === "rejected" ? [attempt.reason as unknown] : [],
    );
    expect(failures).toHaveLength(4);
    for (const failure of failures) expect(failure).toBeInstanceOf(ConflictException);

    // One publication, one decision, one audit entry.
    const detail = await get(app, owner, report.path).expect(200);
    expect(detail.body.report.status).toBe("PUBLISHED");
    const versions = detail.body.report.versions as VersionSummary[];
    expect(versions).toHaveLength(1);
    const version = versions[0]!;
    expect(version).toMatchObject({
      id: report.versionId,
      status: "PUBLISHED",
      storageKey: reportStorageKey(organizationId, report.reportId, report.versionId),
    });
    expect(
      (detail.body.report.approvals as Array<{ action: string }>).map((a) => a.action),
    ).toEqual(["SUBMIT_REVIEW", "APPROVE", "PUBLISH"]);
    const published = await prisma.auditEvent.findMany({
      where: { organizationId, entityId: report.reportId, action: "report.published" },
    });
    expect(published).toHaveLength(1);
    expect(published[0]!.metadata).toMatchObject({
      versionId: report.versionId,
      contentHash: version.contentHash,
      byteSize: version.byteSize,
    });

    // The stored object is the winner's: it matches the recorded hash, size and timestamp.
    const stored = await storage.getObjectBuffer({ bucket, key: version.storageKey! });
    expect(sha256(stored)).toBe(version.contentHash);
    expect(stored.length).toBe(version.byteSize);
    expect(detail.body.report.publishedAt).toBe(version.disclosures?.generatedAt);
    await grantXrayProAccess(prisma, organizationId, report.reportId);
    const pdf = await download(app, viewer, `${report.path}/pdf`).expect(200);
    expect((pdf.body as Buffer).equals(stored)).toBe(true);

    // A late publisher is refused and changes nothing.
    await expect(
      reports.publish({ organizationId, reportId: report.reportId, actor }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await storage.getObjectBuffer({ bucket, key: version.storageKey! })).equals(stored)).toBe(
      true,
    );
    expect(await currentVersion(report)).toEqual(version);
  });

  it("keeps blocked reports, published PDFs and integrity failures invisible to another tenant", async () => {
    const blocked = await reportInReview(groundedNarrative({ risks: [INVENTED_GROWTH] }));
    const published = await publishedReport();
    const { aiRunId } = blocked;
    const earlier = new Set(
      (
        await prisma.auditEvent.findMany({
          where: { actorUserId: outsider.userId },
          select: { id: true },
        })
      ).map((event) => event.id),
    );

    // Neither the report's own organization nor the outsider's resolves anything.
    for (const org of [organizationId, otherOrganizationId]) {
      const reportsBase = `/organizations/${org}/reports`;
      for (const report of [blocked, published]) {
        const path = `${reportsBase}/${report.reportId}`;
        await get(app, outsider, path).expect(404);
        await get(app, outsider, `${path}/versions`).expect(404);
        await get(app, outsider, `${path}/versions/${report.versionId}`).expect(404);
        await get(app, outsider, `${path}/pdf`).expect(404);
        await get(app, outsider, `${path}/pdf?versionId=${report.versionId}`).expect(404);
        for (const step of ["submit-review", "approve", "reject", "publish", "versions"]) {
          await post(app, outsider, `${path}/${step}`).send({}).expect(404);
        }
        await post(app, outsider, `${path}/versions/${report.versionId}/render`)
          .send({})
          .expect(404);
      }
      // The interpretation cannot be read or "corrected" from outside either.
      const aiBase = `/organizations/${org}/ai/interpretations`;
      await get(app, outsider, `${aiBase}/${aiRunId}`).expect(404);
      await post(app, outsider, `${aiBase}/${aiRunId}/versions/${blocked.aiVersionId}/edit`)
        .send({ risks: [] })
        .expect(404);
      // Nor attached to a report of the outsider's own organization.
      await post(app, outsider, reportsBase)
        .send({ diagnosticRunId, aiInterpretationVersionId: blocked.aiVersionId })
        .expect(404);
    }

    // A missing PDF is reported to members only; an outsider learns nothing from it.
    await storage.deleteObject({ bucket, key: published.version.storageKey! });
    await get(app, outsider, `${base}/${published.reportId}/pdf`).expect(404);
    await get(
      app,
      outsider,
      `/organizations/${otherOrganizationId}/reports/${published.reportId}/pdf`,
    ).expect(404);
    expect(await integrityAudits(published.reportId)).toEqual([]);

    // The only traces the outsider leaves are membership refusals for the
    // foreign organization — never integrity, download, or publication events.
    const traces = (
      await prisma.auditEvent.findMany({ where: { actorUserId: outsider.userId } })
    ).filter((event) => !earlier.has(event.id));
    expect(traces.length).toBeGreaterThan(0);
    expect(
      traces.every((event) => {
        if (event.action === "authz.denied") {
          return (event.metadata as { reason?: string }).reason === "not_a_member";
        }
        return false;
      }),
    ).toBe(true);
    expect(
      traces.some(
        (event) =>
          event.action === "report.publication_denied" ||
          event.action === "report.pdf_integrity_failed" ||
          event.action === "report.downloaded",
      ),
    ).toBe(false);

    // Nothing moved.
    expect((await get(app, owner, blocked.path).expect(200)).body.report.status).toBe(
      "REVIEW_REQUIRED",
    );
    expect((await get(app, owner, published.path).expect(200)).body.report.status).toBe(
      "PUBLISHED",
    );
    expect(
      await prisma.aIInterpretationVersion.count({ where: { aiInterpretationRunId: aiRunId } }),
    ).toBe(1);
    expect(
      await prisma.reportAccessEvent.count({
        where: { organizationId, actorUserId: outsider.userId },
      }),
    ).toBe(0);
    expect(
      await prisma.xRayReport.count({ where: { organizationId: otherOrganizationId } }),
    ).toBe(0);

    // The member still gets the integrity failure, and it is still gated for them.
    const missing = await get(app, viewer, `${published.path}/pdf`).expect(409);
    expect(missing.body.code).toBe("PUBLISHED_PDF_MISSING");
    await post(app, viewer, `${blocked.path}/approve`).send({}).expect(403);
    const refused = await post(app, owner, `${blocked.path}/approve`).send({}).expect(409);
    await expectBlocked(refused, "approve");
  });

  it("audits every integrity failure with its actor and never records it as a download", async () => {
    const report = await publishedReport();
    const { version } = report;
    const key = version.storageKey!;
    await download(app, viewer, `${report.path}/pdf`).expect(200);

    await storage.deleteObject({ bucket, key });
    const missing = await get(app, viewer, `${report.path}/pdf`).expect(409);
    const render = await post(app, owner, `${report.path}/versions/${report.versionId}/render`)
      .send({})
      .expect(409);
    const corruptBody = Buffer.from("%PDF-not-the-published-file");
    await storage.putObject({ bucket, key, body: corruptBody, contentType: "application/pdf" });
    const corrupt = await get(app, owner, `${report.path}/pdf`).expect(409);

    const events = await prisma.auditEvent.findMany({
      where: {
        organizationId,
        entityType: "xray_report",
        entityId: report.reportId,
        action: { in: ["report.pdf_integrity_failed", "report.pdf_regenerate_rejected"] },
      },
    });
    const byRequest = new Map(events.map((event) => [event.requestId, event]));
    expect(events).toHaveLength(3);

    expect(byRequest.get(missing.headers["x-request-id"] as string)).toMatchObject({
      action: "report.pdf_integrity_failed",
      actorUserId: viewer.userId,
      metadata: {
        versionId: report.versionId,
        reason: "MISSING_OBJECT",
        storageKey: key,
        expectedHash: version.contentHash,
      },
    });
    expect(byRequest.get(render.headers["x-request-id"] as string)).toMatchObject({
      action: "report.pdf_regenerate_rejected",
      actorUserId: owner.userId,
      metadata: { versionId: report.versionId, contentHash: version.contentHash },
    });
    expect(byRequest.get(corrupt.headers["x-request-id"] as string)).toMatchObject({
      action: "report.pdf_integrity_failed",
      actorUserId: owner.userId,
      metadata: {
        versionId: report.versionId,
        reason: "HASH_MISMATCH",
        storageKey: key,
        expectedHash: version.contentHash,
        actualHash: sha256(corruptBody),
      },
    });

    // Failed deliveries are not downloads.
    expect(await downloadCount(report.reportId)).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: { organizationId, entityId: report.reportId, action: "report.downloaded" },
      }),
    ).toBe(1);
  });
});
