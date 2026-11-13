/**
 * Phase 6C: failed approve/publish attempts are audited, and published
 * disclosures / approval-critical metadata cannot be mutated in place.
 */
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeAiInterpretation } from "../ai/run-ai-interpretation-job";
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
} from "../testing/phase6-fixtures";

describe("Phase 6C publication audit and disclosure lock", () => {
  let app: INestApplication;
  let mail: MemoryEmailService;
  const prisma = testPrisma();

  beforeAll(async () => {
    await resetDatabase();
    ({ app, mail } = await createTestApp());
  });

  afterAll(async () => {
    await cleanupPhase6(app);
    await app.close();
    await prisma.$disconnect();
  });

  async function scoredReport(label: string) {
    const owner = await signUp(app, mail, `${label}-owner`);
    const analyst = await signUp(app, mail, `${label}-analyst`);
    const outsider = await signUp(app, mail, `${label}-out`);
    const organizationId = await createOrganization(app, owner, label);
    await addMember(organizationId, analyst.userId, "ANALYST");
    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: SCORABLE_STATEMENTS,
    });
    const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);
    const created = await post(app, owner, `/organizations/${organizationId}/reports`)
      .send({ diagnosticRunId, title: `6C ${label}` })
      .expect(201);
    const reportId = created.body.report.id as string;
    const versionId = created.body.report.versions[0].id as string;
    const path = `/organizations/${organizationId}/reports/${reportId}`;
    return { owner, analyst, outsider, organizationId, reportId, versionId, path, diagnosticRunId };
  }

  it("audits failed approval for grounding and invalid state; permission denials are auditable", async () => {
    const ctx = await scoredReport("deny-approve");

    // Invalid state: DRAFT cannot be approved.
    const premature = await post(app, ctx.owner, `${ctx.path}/approve`).send({}).expect(409);
    expect(premature.body.code).toBe("INVALID_STATE");
    const stateDenial = await prisma.auditEvent.findFirst({
      where: {
        organizationId: ctx.organizationId,
        entityId: ctx.reportId,
        action: "report.publication_denied",
        actorUserId: ctx.owner.userId,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(stateDenial?.metadata).toMatchObject({
      requestedAction: "approve",
      failureCode: "INVALID_STATE",
      failureClass: "STATE",
      versionId: ctx.versionId,
    });
    expect(JSON.stringify(stateDenial?.metadata)).not.toMatch(/REVENUE|password|%PDF/i);

    // Analyst lacks xray:publish.
    await post(app, ctx.analyst, `${ctx.path}/approve`).send({}).expect(403);
    const permDenial = await prisma.auditEvent.findFirst({
      where: {
        organizationId: ctx.organizationId,
        entityId: ctx.reportId,
        action: "report.publication_denied",
        actorUserId: ctx.analyst.userId,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(permDenial?.metadata).toMatchObject({
      requestedAction: "approve",
      failureCode: "MISSING_PERMISSION",
      failureClass: "PERMISSION",
    });

    // Cross-tenant remains denied (membership guard) without leaking the report.
    await post(app, ctx.outsider, `${ctx.path}/approve`).send({}).expect(404);

    // Dedup: repeating the same invalid approve does not flood the audit log.
    await post(app, ctx.owner, `${ctx.path}/approve`).send({}).expect(409);
    const denialCount = await prisma.auditEvent.count({
      where: {
        organizationId: ctx.organizationId,
        entityId: ctx.reportId,
        actorUserId: ctx.owner.userId,
        action: "report.publication_denied",
      },
    });
    expect(denialCount).toBe(1);
  });

  it("audits failed publication attempts and locks published disclosures", async () => {
    const ctx = await scoredReport("deny-publish");
    await post(app, ctx.owner, `${ctx.path}/submit-review`).send({}).expect(200);

    // Publish without approval.
    const skipped = await post(app, ctx.owner, `${ctx.path}/publish`).send({}).expect(409);
    expect(skipped.body.code).toBe("INVALID_STATE");
    expect(
      await prisma.auditEvent.findFirst({
        where: {
          organizationId: ctx.organizationId,
          entityId: ctx.reportId,
          action: "report.publication_denied",
          actorUserId: ctx.owner.userId,
        },
        orderBy: { createdAt: "desc" },
      }),
    ).toMatchObject({
      metadata: expect.objectContaining({
        requestedAction: "publish",
        failureCode: "INVALID_STATE",
        failureClass: "STATE",
      }),
    });

    await post(app, ctx.owner, `${ctx.path}/approve`).send({}).expect(200);
    const published = await post(app, ctx.owner, `${ctx.path}/publish`).send({}).expect(200);
    await grantXrayProAccess(prisma, ctx.organizationId, ctx.reportId);
    const versionId = published.body.report.versions[0].id as string;
    const frozen = published.body.report.versions[0].disclosures;

    await expect(
      prisma.xRayReportVersion.update({
        where: { id: versionId },
        data: { disclosures: { ...frozen, verifiedPublication: !frozen?.verifiedPublication } },
      }),
    ).rejects.toThrow(/immutable/);

    await expect(
      prisma.xRayReportVersion.update({
        where: { id: versionId },
        data: {
          disclosures: {
            ...frozen,
            groundingValidation: { passed: true, criticalCount: 0, version: "forged" },
          },
        },
      }),
    ).rejects.toThrow(/immutable/);

    await expect(
      prisma.xRayReportVersion.update({
        where: { id: versionId },
        data: { contentHash: "0".repeat(64) },
      }),
    ).rejects.toThrow(/immutable/);

    // Genuine supersede path still works via publish of a newer version.
    const revised = await post(app, ctx.owner, `${ctx.path}/versions`).send({}).expect(201);
    expect(revised.body.report.status).toBe("DRAFT");
    const row = await prisma.xRayReportVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(row.disclosures).toEqual(frozen);
    expect(row.contentHash).toBeTruthy();

    // Artifact integrity still enforced on download.
    await get(app, ctx.owner, `${ctx.path}/pdf`).expect(200);
  });

  it("audits grounding-blocked approval without storing narrative text", async () => {
    const owner = await signUp(app, mail, "g-block-owner");
    const organizationId = await createOrganization(app, owner, "g-block");
    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: SCORABLE_STATEMENTS,
    });
    const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [seeded.documentId]);

    const aiCreated = await post(app, owner, `/organizations/${organizationId}/ai/interpretations`)
      .send({ diagnosticRunId })
      .expect(201);
    const aiRunId = aiCreated.body.run.id as string;
    await executeAiInterpretation(
      prisma,
      {
        shareStructuredContext: true,
        providerEnv: { AI_PROVIDER: "mock" },
        createProvider: () => ({
          name: "openai",
          async interpret() {
            return {
              narrative: {
                summary: "Revenue will reach 9,999,999 next year without evidence.",
                keyObservations: ["Invented growth of 500%."],
                risks: [],
                limitations: ["Coverage may be incomplete."],
                claims: [
                  {
                    text: "Revenue will reach 9,999,999 next year without evidence.",
                    groundedMetricCodes: ["REVENUE_GROWTH"],
                    groundedFindingIds: [],
                  },
                ],
              },
              provider: "openai",
              model: "fake",
              promptVersion: "ai.interpret.v1",
              isSimulated: false,
            };
          },
        }),
      },
      { organizationId, aiInterpretationRunId: aiRunId, actorUserId: owner.userId },
      { finalAttempt: true },
    );
    const aiVersion = await prisma.aIInterpretationVersion.findFirstOrThrow({
      where: { aiInterpretationRunId: aiRunId },
      orderBy: { versionNumber: "desc" },
    });

    const created = await post(app, owner, `/organizations/${organizationId}/reports`)
      .send({
        diagnosticRunId,
        title: "Grounding blocked",
        aiInterpretationVersionId: aiVersion.id,
      })
      .expect(201);
    const reportId = created.body.report.id as string;
    const path = `/organizations/${organizationId}/reports/${reportId}`;
    await post(app, owner, `${path}/submit-review`).send({}).expect(200);
    const blocked = await post(app, owner, `${path}/approve`).send({}).expect(409);
    expect(blocked.body.code).toBe("CRITICAL_GROUNDING_VIOLATIONS");

    const denial = await prisma.auditEvent.findFirstOrThrow({
      where: {
        organizationId,
        entityId: reportId,
        action: "report.publication_denied",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(denial.metadata).toMatchObject({
      requestedAction: "approve",
      failureCode: "CRITICAL_GROUNDING_VIOLATIONS",
      failureClass: "GROUNDING",
    });
    const serialized = JSON.stringify(denial.metadata);
    expect(serialized).not.toContain("9,999,999");
    expect(serialized).not.toContain("Invented growth");
  });
});
