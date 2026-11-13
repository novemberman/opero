import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { createPrismaClient } from "@opero/database";
import {
  CALC_ENGINE_VERSION,
  RULE_SET_VERSION,
  SCORE_METHODOLOGY_VERSION,
} from "@opero/diagnostics";
import request from "supertest";
import { loadDatabaseModule } from "../database/load-database";
import { createTestApp, getCookie, mergeCookies } from "../testing/app-factory";
import type { MemoryEmailService } from "../testing/memory-email.service";
import { deletePhase6Data } from "../testing/phase6-cleanup";
import { runDiagnosticJob } from "./run-diagnostic-job";

async function registerVerifyLogin(
  app: INestApplication,
  mail: MemoryEmailService,
  user: { email: string; name: string; password: string },
) {
  await request(app.getHttpServer()).post("/api/v1/auth/register").send(user).expect(201);
  const token = mail.latestToken("/verify-email");
  await request(app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(204);
  const login = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email: user.email, password: user.password })
    .expect(200);
  const session = getCookie(
    login.headers["set-cookie"],
    process.env.SESSION_COOKIE_NAME ?? "opero_session",
  )!;
  const csrfRes = await request(app.getHttpServer())
    .get("/api/v1/auth/csrf")
    .set("Cookie", session)
    .expect(200);
  return {
    session,
    cookies: mergeCookies(
      session,
      getCookie(csrfRes.headers["set-cookie"], process.env.CSRF_COOKIE_NAME ?? "opero_csrf"),
    ),
    csrfToken: csrfRes.body.csrfToken as string,
  };
}

async function seedFinancialDocument(input: {
  organizationId: string;
  userId: string;
  incomplete?: boolean;
}) {
  const prisma = createPrismaClient(process.env.DATABASE_URL!);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const document = await prisma.document.create({
    data: {
      organizationId: input.organizationId,
      uploadedByUserId: input.userId,
      originalFilename: `diag-${suffix}.csv`,
      mimeType: "text/csv",
      format: "CSV",
      byteSize: 100n,
      sha256: `sha-${suffix}`,
      storageKey: `org/${input.organizationId}/documents/${suffix}.csv`,
      processingStatus: "READY",
      scanStatus: "CLEAN",
      extractionStatus: "SUCCEEDED",
    },
  });
  const extraction = await prisma.documentExtraction.create({
    data: {
      organizationId: input.organizationId,
      documentId: document.id,
      method: "test-seed",
      quality: "HIGH",
      status: "SUCCEEDED",
    },
  });

  async function addLines(
    statementId: string,
    rows: Array<[string, string]>,
  ): Promise<void> {
    for (const [concept, value] of rows) {
      await prisma.financialLineItem.create({
        data: {
          organizationId: input.organizationId,
          statementId,
          concept: concept as never,
          labelRaw: concept,
          rawValue: value,
          normalizedValue: value,
          currency: "USD",
          unitScale: "ACTUAL",
          extractionMethod: "test-seed",
          quality: "HIGH",
          reviewStatus: "CONFIRMED",
        },
      });
    }
  }

  if (input.incomplete) {
    const statement = await prisma.financialStatement.create({
      data: {
        organizationId: input.organizationId,
        documentId: document.id,
        extractionId: extraction.id,
        statementType: "INCOME_STATEMENT",
        currency: "USD",
        unitScale: "ACTUAL",
        periodStart: new Date("2024-01-01"),
        periodEnd: new Date("2024-12-31"),
        periodLabel: "FY2024",
      },
    });
    await addLines(statement.id, [["REVENUE", "100"]]);
  } else {
    const fy23 = await prisma.financialStatement.create({
      data: {
        organizationId: input.organizationId,
        documentId: document.id,
        extractionId: extraction.id,
        statementType: "INCOME_STATEMENT",
        currency: "USD",
        unitScale: "ACTUAL",
        periodStart: new Date("2023-01-01"),
        periodEnd: new Date("2023-12-31"),
        periodLabel: "FY2023",
      },
    });
    const fy24 = await prisma.financialStatement.create({
      data: {
        organizationId: input.organizationId,
        documentId: document.id,
        extractionId: extraction.id,
        statementType: "INCOME_STATEMENT",
        currency: "USD",
        unitScale: "ACTUAL",
        periodStart: new Date("2024-01-01"),
        periodEnd: new Date("2024-12-31"),
        periodLabel: "FY2024",
      },
    });
    await addLines(fy23.id, [["REVENUE", "1000"]]);
    await addLines(fy24.id, [
      ["REVENUE", "1200"],
      ["COST_OF_GOODS_SOLD", "480"],
      ["GROSS_PROFIT", "720"],
      ["OPERATING_EXPENSES", "300"],
      ["OPERATING_PROFIT", "420"],
      ["NET_PROFIT", "300"],
      ["CASH_AND_EQUIVALENTS", "200"],
      ["ACCOUNTS_RECEIVABLE", "100"],
      ["ACCOUNTS_PAYABLE", "80"],
      ["INVENTORY", "120"],
      ["CURRENT_ASSETS", "500"],
      ["CURRENT_LIABILITIES", "250"],
      ["TOTAL_ASSETS", "1000"],
      ["TOTAL_LIABILITIES", "400"],
      ["EQUITY", "600"],
      ["INTEREST_BEARING_DEBT", "200"],
      ["INTEREST_EXPENSE", "40"],
      ["OPERATING_CASH_FLOW", "350"],
      ["CAPITAL_EXPENDITURE", "50"],
    ]);
  }

  await prisma.$disconnect();
  return document.id;
}

describe("diagnostics integration", () => {
  let app: INestApplication;
  let mail: MemoryEmailService;

  beforeAll(async () => {
    const { createPrismaClient: create } = await loadDatabaseModule();
    const prisma = create(process.env.DATABASE_URL!);
    await deletePhase6Data(prisma);
    await prisma.diagnosticEvidenceLink.deleteMany();
    await prisma.diagnosticReview.deleteMany();
    await prisma.diagnosticFinding.deleteMany();
    await prisma.scoreComponent.deleteMany();
    await prisma.diagnosticScore.deleteMany();
    await prisma.dataQualityAssessment.deleteMany();
    await prisma.financialMetric.deleteMany();
    await prisma.diagnosticInputSnapshot.deleteMany();
    await prisma.diagnosticRun.deleteMany();
    await prisma.diagnosticRuleVersion.deleteMany();
    await prisma.documentAccessEvent.deleteMany();
    await prisma.extractionReview.deleteMany();
    await prisma.financialLineItem.deleteMany();
    await prisma.evidenceReference.deleteMany();
    await prisma.financialStatement.deleteMany();
    await prisma.documentExtraction.deleteMany();
    await prisma.documentProcessingJob.deleteMany();
    await prisma.documentVersion.deleteMany();
    await prisma.documentUpload.deleteMany();
    await prisma.document.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organizationInvitation.deleteMany();
    await prisma.session.deleteMany();
    await prisma.emailVerificationToken.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
    ({ app, mail } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("runs E2E diagnostics with score, findings, evidence, and tenant isolation", async () => {
    const suffix = `${Date.now()}`;
    const owner = await registerVerifyLogin(app, mail, {
      email: `diag.owner.${suffix}@example.com`,
      name: "Diag Owner",
      password: "diag-owner-pass1",
    });
    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookies)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Diag Org", slug: `diag-org-${suffix}` })
      .expect(201);
    const organizationId = org.body.organization.id as string;
    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", owner.session)
      .expect(200);
    const userId = me.body.user.id as string;

    const documentId = await seedFinancialDocument({ organizationId, userId });

    const created = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/diagnostics`)
      .set("Cookie", owner.cookies)
      .set("x-csrf-token", owner.csrfToken)
      .send({ documentIds: [documentId], currency: "USD" })
      .expect(201);

    const runId = created.body.run.id as string;
    await runDiagnosticJob({
      organizationId,
      diagnosticRunId: runId,
      actorUserId: userId,
    });

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/diagnostics/${runId}`)
      .set("Cookie", owner.session)
      .expect(200);
    expect(detail.body.run.status).toBe("SUCCEEDED");
    expect(detail.body.run.calculationEngineVersion).toBe(CALC_ENGINE_VERSION);
    expect(detail.body.run.ruleSetVersion).toBe(RULE_SET_VERSION);
    expect(detail.body.run.scoreMethodologyVersion).toBe(SCORE_METHODOLOGY_VERSION);
    expect(detail.body.run.score.status).toBe("SCORED");
    expect(detail.body.run.score.overallScore).toBeTypeOf("number");

    const metrics = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/diagnostics/${runId}/metrics`)
      .set("Cookie", owner.session)
      .expect(200);
    const net = metrics.body.metrics.find((m: { code: string }) => m.code === "NET_MARGIN");
    expect(net.status).toBe("COMPUTED");
    expect(net.value).toBe("0.25");

    const score = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/diagnostics/${runId}/score`)
      .set("Cookie", owner.session)
      .expect(200);
    expect(score.body.score.methodologyVersion).toBe(SCORE_METHODOLOGY_VERSION);

    const findings = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/diagnostics/${runId}/findings`)
      .set("Cookie", owner.session)
      .expect(200);
    expect(Array.isArray(findings.body.findings)).toBe(true);

    const prisma = createPrismaClient(process.env.DATABASE_URL!);
    const beforeHash = (
      await prisma.diagnosticInputSnapshot.findFirstOrThrow({ where: { diagnosticRunId: runId } })
    ).contentHash;
    await prisma.financialLineItem.updateMany({
      where: { organizationId, concept: "NET_PROFIT" },
      data: { normalizedValue: "1" },
    });
    await runDiagnosticJob({
      organizationId,
      diagnosticRunId: runId,
      actorUserId: userId,
    });
    const afterHash = (
      await prisma.diagnosticInputSnapshot.findFirstOrThrow({ where: { diagnosticRunId: runId } })
    ).contentHash;
    expect(afterHash).toBe(beforeHash);
    await prisma.$disconnect();

    const other = await registerVerifyLogin(app, mail, {
      email: `diag.other.${suffix}@example.com`,
      name: "Other",
      password: "diag-other-pass1",
    });
    const otherOrg = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", other.cookies)
      .set("x-csrf-token", other.csrfToken)
      .send({ name: "Other Diag", slug: `other-diag-${suffix}` })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${otherOrg.body.organization.id}/diagnostics/${runId}`)
      .set("Cookie", other.session)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/diagnostics/${runId}`)
      .set("Cookie", other.session)
      .expect(404);
  });

  it("returns INSUFFICIENT_DATA for incomplete inputs and blocks VIEWER writes", async () => {
    const suffix = `${Date.now()}-i`;
    const owner = await registerVerifyLogin(app, mail, {
      email: `diag.inc.${suffix}@example.com`,
      name: "Inc",
      password: "diag-inc-pass12",
    });
    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookies)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Inc Org", slug: `inc-org-${suffix}` })
      .expect(201);
    const organizationId = org.body.organization.id as string;
    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", owner.session)
      .expect(200);
    const documentId = await seedFinancialDocument({
      organizationId,
      userId: me.body.user.id,
      incomplete: true,
    });

    const created = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/diagnostics`)
      .set("Cookie", owner.cookies)
      .set("x-csrf-token", owner.csrfToken)
      .send({ documentIds: [documentId], currency: "USD" })
      .expect(201);
    await runDiagnosticJob({
      organizationId,
      diagnosticRunId: created.body.run.id,
      actorUserId: me.body.user.id,
    });
    const score = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/diagnostics/${created.body.run.id}/score`)
      .set("Cookie", owner.session)
      .expect(200);
    expect(score.body.score.status).toBe("INSUFFICIENT_DATA");
    expect(score.body.score.overallScore).toBeNull();

    const viewer = await registerVerifyLogin(app, mail, {
      email: `diag.viewer.${suffix}@example.com`,
      name: "Viewer",
      password: "diag-viewer-pass",
    });
    const prisma = createPrismaClient(process.env.DATABASE_URL!);
    await prisma.membership.create({
      data: {
        organizationId,
        userId: (
          await prisma.user.findFirstOrThrow({
            where: { email: `diag.viewer.${suffix}@example.com` },
          })
        ).id,
        role: "VIEWER",
      },
    });
    await prisma.$disconnect();

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/diagnostics`)
      .set("Cookie", viewer.cookies)
      .set("x-csrf-token", viewer.csrfToken)
      .send({ documentIds: [documentId] })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/diagnostics/${created.body.run.id}`)
      .set("Cookie", viewer.session)
      .expect(200);
  });
});
