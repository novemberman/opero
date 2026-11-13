import { getQueueToken } from "@nestjs/bullmq";
import type { INestApplication } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@opero/database";
import { AI_QUEUE, REPORTS_QUEUE, XRAY_PRO_ENTITLEMENTS } from "@opero/shared";
import type { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { runDiagnosticJob } from "../diagnostics/run-diagnostic-job";
import { getCookie, mergeCookies } from "./app-factory";
import type { MemoryEmailService } from "./memory-email.service";
import { deletePhase6Data } from "./phase6-cleanup";

/** Test-only: grants report-scoped X-Ray Pro entitlements without a payment. */
export async function grantXrayProAccess(
  prisma: PrismaClient,
  organizationId: string,
  reportId: string,
  sourceId = `test_${randomUUID()}`,
): Promise<void> {
  for (const code of XRAY_PRO_ENTITLEMENTS) {
    await prisma.entitlementGrant.upsert({
      where: {
        organizationId_code_scopeType_scopeId_sourceId: {
          organizationId,
          code,
          scopeType: "REPORT",
          scopeId: reportId,
          sourceId,
        },
      },
      create: {
        organizationId,
        code,
        scopeType: "REPORT",
        scopeId: reportId,
        sourceType: "MANUAL",
        sourceId,
        validFrom: new Date(),
      },
      update: { revokedAt: null, revokeReason: null, validUntil: null },
    });
  }
}

export type TestSession = {
  userId: string;
  session: string;
  cookies: string;
  csrfToken: string;
};

export function testPrisma(): PrismaClient {
  return createPrismaClient(process.env.DATABASE_URL!);
}

/** Empties the test database, including Phase 6 tables. */
export async function resetDatabase(): Promise<void> {
  const prisma = testPrisma();
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
}

/**
 * Removes Phase 6 rows and the queue jobs created for them. Only jobs whose
 * ids belong to rows in the test database are removed, so jobs of a
 * development stack sharing the same Redis are left alone.
 */
export async function cleanupPhase6(app?: INestApplication): Promise<void> {
  const prisma = testPrisma();
  if (app) {
    const aiRuns = await prisma.aIInterpretationRun.findMany({ select: { id: true } });
    const versions = await prisma.xRayReportVersion.findMany({ select: { id: true } });
    const aiQueue = app.get<Queue>(getQueueToken(AI_QUEUE));
    const reportsQueue = app.get<Queue>(getQueueToken(REPORTS_QUEUE));
    for (const { id } of aiRuns) await aiQueue.remove(id);
    for (const { id } of versions) await reportsQueue.remove(id);
  }
  await deletePhase6Data(prisma);
  await prisma.$disconnect();
}

let userCounter = 0;

/** Registers, verifies and logs in a fresh user. */
export async function signUp(
  app: INestApplication,
  mail: MemoryEmailService,
  label: string,
): Promise<TestSession> {
  userCounter += 1;
  const user = {
    email: `p6.${label}.${Date.now()}.${userCounter}@example.com`,
    name: `P6 ${label}`,
    password: `p6-${label}-password-1`,
  };
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
  const me = await request(app.getHttpServer())
    .get("/api/v1/auth/me")
    .set("Cookie", session)
    .expect(200);
  return {
    userId: me.body.user.id as string,
    session,
    cookies: mergeCookies(
      session,
      getCookie(csrfRes.headers["set-cookie"], process.env.CSRF_COOKIE_NAME ?? "opero_csrf"),
    ),
    csrfToken: csrfRes.body.csrfToken as string,
  };
}

export async function createOrganization(
  app: INestApplication,
  owner: TestSession,
  label: string,
): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const res = await request(app.getHttpServer())
    .post("/api/v1/organizations")
    .set("Cookie", owner.cookies)
    .set("x-csrf-token", owner.csrfToken)
    .send({ name: `P6 ${label}`, slug: `p6-${label}-${suffix}` })
    .expect(201);
  return res.body.organization.id as string;
}

export async function addMember(
  organizationId: string,
  userId: string,
  role: "ADMIN" | "ANALYST" | "VIEWER",
): Promise<void> {
  const prisma = testPrisma();
  await prisma.membership.create({ data: { organizationId, userId, role } });
  await prisma.$disconnect();
}

/** Authenticated state-changing request with the CSRF header set. */
export function post(app: INestApplication, actor: TestSession, path: string) {
  return request(app.getHttpServer())
    .post(`/api/v1${path}`)
    .set("Cookie", actor.cookies)
    .set("x-csrf-token", actor.csrfToken);
}

export function patch(app: INestApplication, actor: TestSession, path: string) {
  return request(app.getHttpServer())
    .patch(`/api/v1${path}`)
    .set("Cookie", actor.cookies)
    .set("x-csrf-token", actor.csrfToken);
}

export function get(app: INestApplication, actor: TestSession, path: string) {
  return request(app.getHttpServer()).get(`/api/v1${path}`).set("Cookie", actor.session);
}

export type SeedStatement = {
  periodLabel?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  currency?: string | null;
  reviewStatus?: "PENDING" | "CONFIRMED";
  lines: Array<[concept: string, value: string]>;
};

export const FY2024: Pick<SeedStatement, "periodLabel" | "periodStart" | "periodEnd" | "currency"> =
  {
    periodLabel: "FY2024",
    periodStart: "2024-01-01",
    periodEnd: "2024-12-31",
    currency: "USD",
  };

/** Enough FY2023 + FY2024 evidence for the engine to produce a score. */
export const SCORABLE_STATEMENTS: SeedStatement[] = [
  {
    periodLabel: "FY2023",
    periodStart: "2023-01-01",
    periodEnd: "2023-12-31",
    currency: "USD",
    lines: [["REVENUE", "1000"]],
  },
  {
    ...FY2024,
    lines: [
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
    ],
  },
];

/** Too little evidence to score: the engine reports INSUFFICIENT_DATA. */
export const UNSCORABLE_STATEMENTS: SeedStatement[] = [{ ...FY2024, lines: [["REVENUE", "100"]] }];

/** Inserts a clean, extracted document directly (no upload pipeline). */
export async function seedDocument(input: {
  organizationId: string;
  userId: string;
  statements: SeedStatement[];
}): Promise<{
  documentId: string;
  filename: string;
  statementIds: string[];
  /** Line item ids keyed by `${periodLabel}:${concept}`. */
  lineItemIds: Record<string, string>;
}> {
  const prisma = testPrisma();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const filename = `p6-${suffix}.csv`;
  const document = await prisma.document.create({
    data: {
      organizationId: input.organizationId,
      uploadedByUserId: input.userId,
      originalFilename: filename,
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

  const statementIds: string[] = [];
  const lineItemIds: Record<string, string> = {};
  for (const seed of input.statements) {
    const statement = await prisma.financialStatement.create({
      data: {
        organizationId: input.organizationId,
        documentId: document.id,
        extractionId: extraction.id,
        statementType: "INCOME_STATEMENT",
        currency: seed.currency ?? null,
        unitScale: "ACTUAL",
        periodStart: seed.periodStart ? new Date(seed.periodStart) : null,
        periodEnd: seed.periodEnd ? new Date(seed.periodEnd) : null,
        periodLabel: seed.periodLabel ?? null,
      },
    });
    statementIds.push(statement.id);
    for (const [concept, value] of seed.lines) {
      const item = await prisma.financialLineItem.create({
        data: {
          organizationId: input.organizationId,
          statementId: statement.id,
          concept: concept as never,
          labelRaw: concept,
          rawValue: value,
          normalizedValue: value,
          currency: seed.currency ?? null,
          unitScale: "ACTUAL",
          extractionMethod: "test-seed",
          quality: "HIGH",
          reviewStatus: seed.reviewStatus ?? "CONFIRMED",
        },
      });
      lineItemIds[`${seed.periodLabel ?? ""}:${concept}`] = item.id;
    }
  }

  await prisma.$disconnect();
  return { documentId: document.id, filename, statementIds, lineItemIds };
}

/** Starts a diagnostic through the API. The run stays QUEUED until completed. */
export async function startDiagnostic(
  app: INestApplication,
  actor: TestSession,
  organizationId: string,
  documentIds: string[],
): Promise<string> {
  const created = await post(app, actor, `/organizations/${organizationId}/diagnostics`)
    .send({ documentIds, currency: "USD" })
    .expect(201);
  return created.body.run.id as string;
}

/** Starts a diagnostic and runs the engine in-process until it has SUCCEEDED. */
export async function runDiagnostic(
  app: INestApplication,
  actor: TestSession,
  organizationId: string,
  documentIds: string[],
): Promise<string> {
  const diagnosticRunId = await startDiagnostic(app, actor, organizationId, documentIds);
  await runDiagnosticJob({ organizationId, diagnosticRunId, actorUserId: actor.userId });
  return diagnosticRunId;
}
