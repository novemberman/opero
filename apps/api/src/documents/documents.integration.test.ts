import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { createPrismaClient } from "@opero/database";
import { materialMonetaryNeedsConfirmation } from "@opero/diagnostics";
import { extractFinancialDocument } from "@opero/document-processing";
import { MemoryObjectStorage, MockMalwareScanner } from "@opero/object-storage";
import request from "supertest";
import { loadDatabaseModule } from "../database/load-database";
import { OBJECT_STORAGE } from "../storage/storage.constants";
import { createTestApp, getCookie, mergeCookies } from "../testing/app-factory";
import type { MemoryEmailService } from "../testing/memory-email.service";
import { deletePhase6Data } from "../testing/phase6-cleanup";

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

async function runPipeline(input: {
  organizationId: string;
  documentId: string;
  processingJobId: string;
  storage: MemoryObjectStorage;
  scanner?: MockMalwareScanner;
}) {
  const prisma = createPrismaClient(process.env.DATABASE_URL!);
  const scanner = input.scanner ?? new MockMalwareScanner("CLEAN");
  const document = await prisma.document.findFirstOrThrow({
    where: { id: input.documentId, organizationId: input.organizationId },
  });
  const job = await prisma.documentProcessingJob.findFirstOrThrow({
    where: {
      id: input.processingJobId,
      organizationId: input.organizationId,
      documentId: input.documentId,
    },
  });
  if (["READY", "REVIEW_REQUIRED", "REJECTED", "FAILED"].includes(job.status)) {
    await prisma.$disconnect();
    return job.status;
  }

  const quarantineBucket = process.env.S3_QUARANTINE_BUCKET ?? "opero-quarantine";
  const documentsBucket = process.env.S3_DOCUMENTS_BUCKET ?? "opero-documents";
  const buffer = await input.storage.getObjectBuffer({
    bucket: quarantineBucket,
    key: document.quarantineKey!,
  });
  const scan = await scanner.scan(buffer);
  if (scan.verdict !== "CLEAN") {
    await prisma.document.update({
      where: { id: document.id },
      data: {
        processingStatus: scan.verdict === "INFECTED" ? "REJECTED" : "FAILED",
        scanStatus: scan.verdict === "INFECTED" ? "INFECTED" : "UNAVAILABLE",
        failureClass: scan.verdict === "INFECTED" ? "MALWARE" : "SCANNER_UNAVAILABLE",
      },
    });
    await prisma.documentProcessingJob.update({
      where: { id: job.id },
      data: {
        status: scan.verdict === "INFECTED" ? "REJECTED" : "FAILED",
        finishedAt: new Date(),
      },
    });
    await prisma.$disconnect();
    return scan.verdict === "INFECTED" ? "REJECTED" : "FAILED";
  }

  await input.storage.copyObject({
    sourceBucket: quarantineBucket,
    sourceKey: document.quarantineKey!,
    destinationBucket: documentsBucket,
    destinationKey: document.storageKey,
  });
  await input.storage.deleteObject({
    bucket: quarantineBucket,
    key: document.quarantineKey!,
  });

  const accepted = await input.storage.getObjectBuffer({
    bucket: documentsBucket,
    key: document.storageKey,
  });
  const extraction = await extractFinancialDocument({
    format: document.format,
    buffer: accepted,
    documentId: document.id,
  });

  let nextStatus: "READY" | "REVIEW_REQUIRED" = "READY";
  await prisma.$transaction(async (tx) => {
    const extractionRow = await tx.documentExtraction.create({
      data: {
        organizationId: input.organizationId,
        documentId: document.id,
        method: extraction.method,
        quality: extraction.quality,
        status: extraction.manualRequired ? "MANUAL_REQUIRED" : "SUCCEEDED",
        warnings: extraction.warnings,
        finishedAt: new Date(),
      },
    });
    for (const statement of extraction.statements) {
      const statementRow = await tx.financialStatement.create({
        data: {
          organizationId: input.organizationId,
          documentId: document.id,
          extractionId: extractionRow.id,
          statementType: statement.statementType,
          currency: statement.currency,
          unitScale: statement.unitScale,
          periodStart: statement.periodStart ? new Date(statement.periodStart) : null,
          periodEnd: statement.periodEnd ? new Date(statement.periodEnd) : null,
          periodLabel: statement.periodLabel,
          entityName: statement.entityName,
          consolidationScope: statement.consolidationScope,
          extractedMetadata: {
            scaleConfidence: statement.scaleConfidence,
            unitScaleRequiresReview: statement.unitScaleRequiresReview,
            consistency: extraction.consistency,
            duplicates: extraction.duplicates,
          },
        },
      });
      for (const line of statement.lines) {
        const evidence = await tx.evidenceReference.create({
          data: {
            organizationId: input.organizationId,
            documentId: document.id,
            evidenceKey: line.evidence.evidenceKey,
            pageNumber: line.evidence.pageNumber,
            sheetName: line.evidence.sheetName,
            cellRef: line.evidence.cellRef,
            rowIndex: line.evidence.rowIndex,
            columnIndex: line.evidence.columnIndex,
            snippet: line.evidence.snippet,
          },
        });
        await tx.financialLineItem.create({
          data: {
            organizationId: input.organizationId,
            statementId: statementRow.id,
            concept: line.concept,
            labelRaw: line.labelRaw,
            rawValue: line.rawValue,
            normalizedValue: line.normalizedValue,
            currency: line.currency,
            unitScale: line.unitScale,
            quantityClass: line.quantityClass,
            scaleConfidence: line.scaleConfidence,
            unitScaleRequiresReview: line.unitScaleRequiresReview,
            extractionMethod: extraction.method,
            quality: line.quality,
            evidenceId: evidence.id,
          },
        });
      }
    }
    const materialPending = extraction.statements.some((statement) =>
      statement.lines.some((line) =>
        materialMonetaryNeedsConfirmation({
          concept: line.concept,
          quantityClass: line.quantityClass,
          reviewStatus: "PENDING",
          unitScale: line.unitScale,
          unitScaleRequiresReview: line.unitScaleRequiresReview,
        }),
      ),
    );
    const scaleNeedsReview = extraction.statements.some((s) => s.unitScaleRequiresReview);
    nextStatus =
      extraction.manualRequired ||
      extraction.quality === "LOW" ||
      scaleNeedsReview ||
      materialPending
        ? "REVIEW_REQUIRED"
        : "READY";
    await tx.document.update({
      where: { id: document.id },
      data: {
        processingStatus: nextStatus,
        scanStatus: "CLEAN",
        extractionStatus: extraction.manualRequired ? "MANUAL_REQUIRED" : "SUCCEEDED",
        quarantineKey: null,
      },
    });
    await tx.documentProcessingJob.update({
      where: { id: job.id },
      data: { status: nextStatus, finishedAt: new Date() },
    });
  });
  await prisma.$disconnect();
  return nextStatus;
}

describe("document ingestion integration", () => {
  let app: INestApplication;
  let mail: MemoryEmailService;
  let storage: MemoryObjectStorage;

  beforeAll(async () => {
    process.env.DOCUMENT_STORAGE_DRIVER = "memory";
    process.env.DOCUMENT_SCANNER_DRIVER = "mock";

    const { createPrismaClient: createClient } = await loadDatabaseModule();
    const prisma = createClient(process.env.DATABASE_URL!);
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
    await prisma.user.deleteMany({
      where: { email: { endsWith: "@example.com" } },
    });
    await prisma.$disconnect();

    ({ app, mail } = await createTestApp({
      envOverrides: {
        DOCUMENT_STORAGE_DRIVER: "memory",
        DOCUMENT_SCANNER_DRIVER: "mock",
      },
    }));

    storage = app.get(OBJECT_STORAGE) as MemoryObjectStorage;
  });

  afterAll(async () => {
    await app.close();
  });

  it("uploads CSV, scans, extracts revenue with evidence, and supports review", async () => {
    const suffix = `${Date.now()}`;
    const auth = await registerVerifyLogin(app, mail, {
      email: `docs.owner.${suffix}@example.com`,
      name: "Docs Owner",
      password: "docs-password-123",
    });
    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({ name: "Docs Org", slug: `docs-org-${suffix}` })
      .expect(201);
    const organizationId = org.body.organization.id as string;

    const upload = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/documents/uploads`)
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({
        filename: "income.csv",
        declaredFormat: "CSV",
        declaredMimeType: "text/csv",
      })
      .expect(201);

    const csv = Buffer.from("Label,Amount\nTotal Revenue,\"2,500.00\"\nNet Income,400\n", "utf8");
    const completed = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/documents/uploads/${upload.body.upload.uploadId}/complete`,
      )
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .attach("file", csv, "income.csv")
      .expect(201);

    const documentId = completed.body.documentId as string;
    const processingJobId = completed.body.processingJobId as string;

    await runPipeline({ organizationId, documentId, processingJobId, storage });
    await runPipeline({ organizationId, documentId, processingJobId, storage });

    const status = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/status`)
      .set("Cookie", auth.session)
      .expect(200);
    expect(["READY", "REVIEW_REQUIRED"]).toContain(status.body.processingStatus);
    expect(status.body.scanStatus).toBe("CLEAN");
    expect(status.body.progress).toMatchObject({
      documentId,
      organizationId,
      currentStage: expect.any(String),
      humanActionRequired: expect.any(Boolean),
    });
    expect(status.body.progress.stages.length).toBeGreaterThan(5);

    const extractions = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/extractions`)
      .set("Cookie", auth.session)
      .expect(200);
    const lines = extractions.body.extractions[0].statements[0].lineItems as Array<{
      id: string;
      concept: string;
      normalizedValue: string;
      evidence: { rowIndex: number };
      rawValue: string;
      reviewStatus: string;
    }>;
    const revenue = lines.find((line) => line.concept === "REVENUE") as
      | {
          id: string;
          concept: string;
          normalizedValue: string;
          actualMonetaryValue?: string | null;
          unitScale?: string;
          evidence: { rowIndex: number };
        }
      | undefined;
    expect(revenue?.normalizedValue).toBe("2500");
    expect(revenue?.actualMonetaryValue).toBe("2500");
    expect(revenue?.unitScale ?? "ACTUAL").toBe("ACTUAL");
    expect(revenue?.evidence.rowIndex).toBe(2);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/documents/${documentId}/review`)
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({
        lineItemId: revenue!.id,
        action: "CONFIRM",
        newValue: "9999.00",
        reason: "Must not silently confirm while a correction is supplied",
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/documents/${documentId}/review`)
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({
        lineItemId: revenue!.id,
        action: "CORRECT",
        newValue: "2500.00",
        reason: "Normalize scale",
      })
      .expect(201);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/extractions`)
      .set("Cookie", auth.session)
      .expect(200);
    const updated = after.body.extractions[0].statements[0].lineItems.find(
      (line: { id: string }) => line.id === revenue!.id,
    );
    expect(updated.rawValue).toBe("2,500.00");
    expect(updated.normalizedValue).toBe("2500.00");
    expect(updated.reviewStatus).toBe("CONFIRMED");

  });

  it("persists CONFIRM with review row, audit attribution, refresh, and denies cross-tenant", async () => {
    const suffix = `${Date.now()}-confirm`;
    const auth = await registerVerifyLogin(app, mail, {
      email: `docs.confirm.${suffix}@example.com`,
      name: "Confirm Owner",
      password: "docs-password-123",
    });
    const outsider = await registerVerifyLogin(app, mail, {
      email: `docs.outsider.${suffix}@example.com`,
      name: "Outsider",
      password: "docs-password-123",
    });
    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({ name: "Confirm Org", slug: `confirm-org-${suffix}` })
      .expect(201);
    const organizationId = org.body.organization.id as string;
    const outsiderOrg = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", outsider.cookies)
      .set("x-csrf-token", outsider.csrfToken)
      .send({ name: "Outsider Org", slug: `outsider-org-${suffix}` })
      .expect(201);
    const outsiderOrganizationId = outsiderOrg.body.organization.id as string;

    const upload = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/documents/uploads`)
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({
        filename: "confirm.csv",
        declaredFormat: "CSV",
        declaredMimeType: "text/csv",
      })
      .expect(201);
    const csv = Buffer.from(
      ["Label,Amount", "Total Revenue,\"2,500.00\"", "Cost of sales,\"1,000.00\""].join("\n"),
      "utf8",
    );
    const completed = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/documents/uploads/${upload.body.upload.uploadId}/complete`,
      )
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .attach("file", csv, "confirm.csv")
      .expect(201);
    const documentId = completed.body.documentId as string;
    const processingJobId = completed.body.processingJobId as string;
    await runPipeline({ organizationId, documentId, processingJobId, storage });
    await runPipeline({ organizationId, documentId, processingJobId, storage });

    const extractions = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/extractions`)
      .set("Cookie", auth.session)
      .expect(200);
    const revenue = (
      extractions.body.extractions[0].statements[0].lineItems as Array<{
        id: string;
        concept: string;
        reviewStatus: string;
        rawValue: string;
        normalizedValue: string;
      }>
    ).find((line) => line.concept === "REVENUE");
    expect(revenue?.reviewStatus).toBe("PENDING");

    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/documents/${documentId}/review`)
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({
        lineItemId: revenue!.id,
        action: "CONFIRM",
        reason: "M2 confirm persistence acceptance",
      })
      .expect(201);
    expect(confirmed.body.lineItem.reviewStatus).toBe("CONFIRMED");
    expect(confirmed.body.lineItem.unitScaleRequiresReview).toBe(false);

    // Duplicate CONFIRM remains safe and keeps CONFIRMED.
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/documents/${documentId}/review`)
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({ lineItemId: revenue!.id, action: "CONFIRM" })
      .expect(201);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/extractions`)
      .set("Cookie", auth.session)
      .expect(200);
    const refreshed = after.body.extractions[0].statements[0].lineItems.find(
      (line: { id: string }) => line.id === revenue!.id,
    );
    expect(refreshed.reviewStatus).toBe("CONFIRMED");
    expect(refreshed.rawValue).toBe(revenue!.rawValue);
    expect(refreshed.normalizedValue).toBe(revenue!.normalizedValue);

    const { createPrismaClient } = await loadDatabaseModule();
    const prisma = createPrismaClient(process.env.DATABASE_URL!);
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: `docs.confirm.${suffix}@example.com` },
    });
    const reviews = await prisma.extractionReview.findMany({
      where: { lineItemId: revenue!.id },
      orderBy: { createdAt: "asc" },
    });
    expect(reviews.length).toBeGreaterThanOrEqual(2);
    expect(reviews.every((row) => row.action === "CONFIRM")).toBe(true);
    expect(reviews.every((row) => row.actorUserId === owner.id)).toBe(true);

    const access = await prisma.documentAccessEvent.findMany({
      where: { documentId, action: "REVIEW" },
    });
    expect(access.length).toBeGreaterThanOrEqual(2);
    expect(access.every((row) => row.actorUserId === owner.id)).toBe(true);

    const audits = await prisma.auditEvent.findMany({
      where: {
        organizationId,
        action: "document.reviewed",
        entityId: revenue!.id,
      },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);
    expect(audits.every((row) => row.actorUserId === owner.id)).toBe(true);

    // Cross-tenant: outsider cannot confirm into another org's document.
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/documents/${documentId}/review`)
      .set("Cookie", outsider.cookies)
      .set("x-csrf-token", outsider.csrfToken)
      .send({ lineItemId: revenue!.id, action: "CONFIRM" })
      .expect(404);

    // Cross-tenant: outsider org path with foreign line id is denied.
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${outsiderOrganizationId}/documents/${documentId}/review`)
      .set("Cookie", outsider.cookies)
      .set("x-csrf-token", outsider.csrfToken)
      .send({ lineItemId: revenue!.id, action: "CONFIRM" })
      .expect(404);

    await prisma.$disconnect();
  });

  it("keeps extraction terminal status REVIEW_REQUIRED while material monetary lines are PENDING (D-P0-003)", async () => {
    const suffix = `${Date.now()}-pending-ready`;
    const auth = await registerVerifyLogin(app, mail, {
      email: `docs.pending.${suffix}@example.com`,
      name: "Pending Owner",
      password: "docs-password-123",
    });
    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({ name: "Pending Org", slug: `pending-org-${suffix}` })
      .expect(201);
    const organizationId = org.body.organization.id as string;

    const upload = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/documents/uploads`)
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({
        filename: "pending.csv",
        declaredFormat: "CSV",
        declaredMimeType: "text/csv",
      })
      .expect(201);
    const csv = Buffer.from(
      ["Label,Amount", "Total Revenue,\"1,250,000\"", "Cost of sales,\"750,000\""].join("\n"),
      "utf8",
    );
    const completed = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/documents/uploads/${upload.body.upload.uploadId}/complete`,
      )
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .attach("file", csv, "pending.csv")
      .expect(201);
    const documentId = completed.body.documentId as string;
    const processingJobId = completed.body.processingJobId as string;
    const terminal = await runPipeline({ organizationId, documentId, processingJobId, storage });
    expect(terminal).toBe("REVIEW_REQUIRED");

    const status = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/status`)
      .set("Cookie", auth.session)
      .expect(200);
    expect(status.body.processingStatus).toBe("REVIEW_REQUIRED");

    const prisma = createPrismaClient(process.env.DATABASE_URL!);
    const lines = await prisma.financialLineItem.findMany({
      where: { organizationId, statement: { documentId } },
    });
    expect(lines.some((line) => line.reviewStatus === "PENDING")).toBe(true);
    expect(
      lines.some((line) =>
        materialMonetaryNeedsConfirmation({
          concept: line.concept,
          quantityClass: line.quantityClass,
          reviewStatus: line.reviewStatus,
          unitScale: line.unitScale,
          unitScaleRequiresReview: line.unitScaleRequiresReview,
        }),
      ),
    ).toBe(true);
    await prisma.$disconnect();
  });

  it("reconciles REVIEW_REQUIRED→READY from persisted confirms; status GET is idempotent", async () => {
    const suffix = `${Date.now()}-ready`;
    const auth = await registerVerifyLogin(app, mail, {
      email: `docs.ready.${suffix}@example.com`,
      name: "Ready Owner",
      password: "docs-password-123",
    });
    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({ name: "Ready Org", slug: `ready-org-${suffix}` })
      .expect(201);
    const organizationId = org.body.organization.id as string;

    const upload = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/documents/uploads`)
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({
        filename: "ready.csv",
        declaredFormat: "CSV",
        declaredMimeType: "text/csv",
      })
      .expect(201);
    const csv = Buffer.from(
      [
        "Label,Amount",
        "Total Revenue,\"2,500.00\"",
        "Cost of sales,\"1,000.00\"",
        "Property plant and equipment,\"400.00\"",
      ].join("\n"),
      "utf8",
    );
    const completed = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/documents/uploads/${upload.body.upload.uploadId}/complete`,
      )
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .attach("file", csv, "ready.csv")
      .expect(201);
    const documentId = completed.body.documentId as string;
    const processingJobId = completed.body.processingJobId as string;
    await runPipeline({ organizationId, documentId, processingJobId, storage });
    await runPipeline({ organizationId, documentId, processingJobId, storage });

    const extractions = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/extractions`)
      .set("Cookie", auth.session)
      .expect(200);
    const lines = extractions.body.extractions[0].statements[0].lineItems as Array<{
      id: string;
      concept: string;
      reviewStatus: string;
      quantityClass?: string;
    }>;
    const revenue = lines.find((line) => line.concept === "REVENUE")!;
    const cogs = lines.find((line) => line.concept === "COST_OF_GOODS_SOLD")!;
    const ppe = lines.find((line) => line.concept === "UNMAPPED");

    // Partial confirm: material pending remains → still REVIEW_REQUIRED.
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/documents/${documentId}/review`)
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({ lineItemId: revenue.id, action: "CONFIRM" })
      .expect(201);
    const partial = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/status`)
      .set("Cookie", auth.session)
      .expect(200);
    expect(partial.body.processingStatus).toBe("REVIEW_REQUIRED");
    expect(partial.body.extractionStatus).toBe("MANUAL_REQUIRED");

    // Confirm remaining mapped monetary; optional UNMAPPED PPE may stay PENDING.
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/documents/${documentId}/review`)
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({ lineItemId: cogs.id, action: "CONFIRM" })
      .expect(201);
    if (ppe && ppe.reviewStatus === "PENDING") {
      // Leave PPE pending — must not block READY (not material).
    }

    const readyAfterReview = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/status`)
      .set("Cookie", auth.session)
      .expect(200);
    expect(readyAfterReview.body.processingStatus).toBe("READY");
    expect(readyAfterReview.body.extractionStatus).toBe("SUCCEEDED");

    const { createPrismaClient } = await loadDatabaseModule();
    const prisma = createPrismaClient(process.env.DATABASE_URL!);

    // Sticky badge simulation: force REVIEW_REQUIRED after material confirms complete.
    await prisma.document.update({
      where: { id: documentId },
      data: { processingStatus: "REVIEW_REQUIRED", extractionStatus: "MANUAL_REQUIRED" },
    });
    await prisma.documentProcessingJob.updateMany({
      where: { documentId, organizationId },
      data: { status: "REVIEW_REQUIRED" },
    });

    const promoted = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/status`)
      .set("Cookie", auth.session)
      .expect(200);
    expect(promoted.body.processingStatus).toBe("READY");
    expect(promoted.body.extractionStatus).toBe("SUCCEEDED");

    // Idempotent second status poll — no flip-flop; audit should not spam endlessly.
    const again = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/status`)
      .set("Cookie", auth.session)
      .expect(200);
    expect(again.body.processingStatus).toBe("READY");

    const reconcileAudits = await prisma.auditEvent.findMany({
      where: {
        organizationId,
        action: "document.review_status_reconciled",
        entityId: documentId,
      },
    });
    expect(reconcileAudits.length).toBeGreaterThanOrEqual(1);

    // Optional PPE confirm preserves evidence and does not invent values.
    if (ppe) {
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${organizationId}/documents/${documentId}/review`)
        .set("Cookie", auth.cookies)
        .set("x-csrf-token", auth.csrfToken)
        .send({ lineItemId: ppe.id, action: "CONFIRM" })
        .expect(201);
      const afterPpe = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/status`)
        .set("Cookie", auth.session)
        .expect(200);
      expect(afterPpe.body.processingStatus).toBe("READY");
    }

    await prisma.$disconnect();
  });

  it("persists Revenue of 144,000 NGN thousands and exposes scaled actualMonetaryValue", async () => {
    const suffix = `${Date.now()}-fy24`;
    const auth = await registerVerifyLogin(app, mail, {
      email: `docs.fy24.${suffix}@example.com`,
      name: "FY24 Owner",
      password: "docs-password-123",
    });
    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({ name: "FY24 Org", slug: `fy24-org-${suffix}` })
      .expect(201);
    const organizationId = org.body.organization.id as string;

    const upload = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/documents/uploads`)
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({
        filename: "netshift-fy2024.csv",
        declaredFormat: "CSV",
        declaredMimeType: "text/csv",
      })
      .expect(201);

    const csv = Buffer.from(
      [
        "Netshift Digital Ltd",
        "Year ended 31 December 2024",
        "Amounts in ₦'000",
        "Currency NGN",
        "",
        "Label,Amount",
        'Revenue of,"144,000"',
        "Gross margin,58.3%",
      ].join("\n"),
      "utf8",
    );
    const completed = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/documents/uploads/${upload.body.upload.uploadId}/complete`,
      )
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .attach("file", csv, "netshift-fy2024.csv")
      .expect(201);

    const documentId = completed.body.documentId as string;
    const processingJobId = completed.body.processingJobId as string;
    await runPipeline({ organizationId, documentId, processingJobId, storage });
    await runPipeline({ organizationId, documentId, processingJobId, storage });

    const extractions = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/extractions`)
      .set("Cookie", auth.session)
      .expect(200);
    const lines = extractions.body.extractions[0].statements[0].lineItems as Array<{
      concept: string;
      labelRaw: string;
      rawValue: string;
      normalizedValue: string | null;
      actualMonetaryValue: string | null;
      unitScale: string;
      quantityClass: string;
      reviewStatus: string;
    }>;

    const revenue = lines.find((line) => line.labelRaw === "Revenue of");
    expect(revenue).toMatchObject({
      concept: "REVENUE",
      rawValue: "144,000",
      normalizedValue: "144000",
      unitScale: "THOUSANDS",
      quantityClass: "MONETARY",
      actualMonetaryValue: "144000000",
      reviewStatus: "PENDING",
    });

    const margin = lines.find((line) => /gross margin/i.test(line.labelRaw));
    expect(margin?.quantityClass).toBe("PERCENTAGE");
    expect(margin?.actualMonetaryValue).toBeNull();
  });

  it("denies cross-tenant document access and blocks upload reuse", async () => {
    const suffix = `${Date.now()}-x`;
    const alpha = await registerVerifyLogin(app, mail, {
      email: `docs.alpha.${suffix}@example.com`,
      name: "Alpha",
      password: "alpha-docs-pass1",
    });
    const beta = await registerVerifyLogin(app, mail, {
      email: `docs.beta.${suffix}@example.com`,
      name: "Beta",
      password: "beta-docs-pass12",
    });
    const alphaOrg = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", alpha.cookies)
      .set("x-csrf-token", alpha.csrfToken)
      .send({ name: "Alpha Docs", slug: `alpha-docs-${suffix}` })
      .expect(201);
    const betaOrg = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", beta.cookies)
      .set("x-csrf-token", beta.csrfToken)
      .send({ name: "Beta Docs", slug: `beta-docs-${suffix}` })
      .expect(201);

    const upload = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${alphaOrg.body.organization.id}/documents/uploads`)
      .set("Cookie", alpha.cookies)
      .set("x-csrf-token", alpha.csrfToken)
      .send({ filename: "a.csv", declaredFormat: "CSV" })
      .expect(201);
    const csv = Buffer.from("Label,Amount\nRevenue,10\n", "utf8");
    const completed = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${alphaOrg.body.organization.id}/documents/uploads/${upload.body.upload.uploadId}/complete`,
      )
      .set("Cookie", alpha.cookies)
      .set("x-csrf-token", alpha.csrfToken)
      .attach("file", csv, "a.csv")
      .expect(201);

    await request(app.getHttpServer())
      .get(
        `/api/v1/organizations/${betaOrg.body.organization.id}/documents/${completed.body.documentId}`,
      )
      .set("Cookie", beta.session)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${alphaOrg.body.organization.id}/documents`)
      .set("Cookie", beta.session)
      .expect(404);

    await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${alphaOrg.body.organization.id}/documents/uploads/${upload.body.upload.uploadId}/complete`,
      )
      .set("Cookie", alpha.cookies)
      .set("x-csrf-token", alpha.csrfToken)
      .attach("file", csv, "a.csv")
      .expect(409);
  });

  it("fail-closes when scanner is unavailable and rejects mismatched tenant jobs", async () => {
    const suffix = `${Date.now()}-s`;
    const auth = await registerVerifyLogin(app, mail, {
      email: `docs.scan.${suffix}@example.com`,
      name: "Scan",
      password: "scan-password-12",
    });
    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({ name: "Scan Org", slug: `scan-org-${suffix}` })
      .expect(201);
    const organizationId = org.body.organization.id as string;
    const upload = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/documents/uploads`)
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({ filename: "b.csv", declaredFormat: "CSV" })
      .expect(201);
    const csv = Buffer.from("Label,Amount\nRevenue,11\n", "utf8");
    const completed = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/documents/uploads/${upload.body.upload.uploadId}/complete`,
      )
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .attach("file", csv, "b.csv")
      .expect(201);

    const documentId = completed.body.documentId as string;
    const result = await runPipeline({
      organizationId,
      documentId,
      processingJobId: completed.body.processingJobId,
      storage,
      scanner: new MockMalwareScanner("UNAVAILABLE", "down"),
    });
    expect(result).toBe("FAILED");

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/extractions`)
      .set("Cookie", auth.session)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/download`)
      .set("Cookie", auth.session)
      .expect(403);

    await expect(
      runPipeline({
        organizationId: "00000000-0000-0000-0000-000000000001",
        documentId: "00000000-0000-0000-0000-000000000002",
        processingJobId: "00000000-0000-0000-0000-000000000003",
        storage,
      }),
    ).rejects.toThrow();
  });

  it("rejects EICAR payloads as malware and blocks download/extraction", async () => {
    const suffix = `${Date.now()}-e`;
    const auth = await registerVerifyLogin(app, mail, {
      email: `docs.eicar.${suffix}@example.com`,
      name: "Eicar",
      password: "eicar-password1",
    });
    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({ name: "Eicar Org", slug: `eicar-org-${suffix}` })
      .expect(201);
    const organizationId = org.body.organization.id as string;
    const upload = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/documents/uploads`)
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .send({ filename: "eicar.csv", declaredFormat: "CSV" })
      .expect(201);

    // Harmless EICAR antivirus test string embedded in a CSV that still sniffs as CSV.
    const eicar =
      "Label,Amount\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*,1\n";
    const completed = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/documents/uploads/${upload.body.upload.uploadId}/complete`,
      )
      .set("Cookie", auth.cookies)
      .set("x-csrf-token", auth.csrfToken)
      .attach("file", Buffer.from(eicar, "utf8"), "eicar.csv")
      .expect(201);

    const documentId = completed.body.documentId as string;
    const outcome = await runPipeline({
      organizationId,
      documentId,
      processingJobId: completed.body.processingJobId,
      storage,
      scanner: new MockMalwareScanner("INFECTED", "Eicar-Test-Signature"),
    });
    expect(outcome).toBe("REJECTED");

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/download`)
      .set("Cookie", auth.session)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents/${documentId}/extractions`)
      .set("Cookie", auth.session)
      .expect(403);
  });

  it("denies VIEWER write operations while allowing read", async () => {
    const suffix = `${Date.now()}-v`;
    const owner = await registerVerifyLogin(app, mail, {
      email: `docs.owner.v.${suffix}@example.com`,
      name: "Owner V",
      password: "owner-viewer-12",
    });
    const viewer = await registerVerifyLogin(app, mail, {
      email: `docs.viewer.${suffix}@example.com`,
      name: "Viewer",
      password: "viewer-pass-12",
    });
    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookies)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Viewer Org", slug: `viewer-org-${suffix}` })
      .expect(201);
    const organizationId = org.body.organization.id as string;

    const { createPrismaClient } = await loadDatabaseModule();
    const prisma = createPrismaClient(process.env.DATABASE_URL!);
    const viewerUser = await prisma.user.findUniqueOrThrow({
      where: { email: `docs.viewer.${suffix}@example.com` },
    });
    await prisma.membership.create({
      data: {
        organizationId,
        userId: viewerUser.id,
        role: "VIEWER",
      },
    });
    await prisma.$disconnect();

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/documents`)
      .set("Cookie", viewer.session)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/documents/uploads`)
      .set("Cookie", viewer.cookies)
      .set("x-csrf-token", viewer.csrfToken)
      .send({ filename: "x.csv", declaredFormat: "CSV" })
      .expect(403);
  });
});
