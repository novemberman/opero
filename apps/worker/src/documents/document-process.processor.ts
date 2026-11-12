import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import type { PrismaClient } from "@opero/database";
import { extractFinancialDocument } from "@opero/document-processing";
import type { MalwareScannerPort, ObjectStoragePort } from "@opero/object-storage";
import type { Job } from "bullmq";
import { assertTenantJobContext } from "../tenant/job-context";
import {
  DOCUMENT_PROCESS_JOB,
  DOCUMENTS_QUEUE_NAME,
  MALWARE_SCANNER,
  OBJECT_STORAGE,
  PRISMA_CLIENT,
} from "./documents.constants";

type DocumentJobData = {
  organizationId: string;
  documentId: string;
  processingJobId: string;
  actorUserId: string;
  correlationId?: string;
};

@Processor(DOCUMENTS_QUEUE_NAME)
export class DocumentProcessProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessProcessor.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScannerPort,
  ) {
    super();
  }

  async process(job: Job<DocumentJobData>): Promise<void> {
    if (job.name !== DOCUMENT_PROCESS_JOB) {
      return;
    }

    assertTenantJobContext(job.data);
    const { organizationId, documentId, processingJobId, actorUserId } = job.data;

    if (
      typeof documentId !== "string" ||
      typeof processingJobId !== "string" ||
      documentId.length === 0 ||
      processingJobId.length === 0
    ) {
      throw new Error("Job payload missing document identifiers");
    }

    const processingJob = await this.prisma.documentProcessingJob.findFirst({
      where: { id: processingJobId, organizationId, documentId },
    });
    if (!processingJob) {
      throw new Error("Processing job not found for tenant context");
    }

    // Idempotency: terminal states are no-ops (restart/retry safe).
    if (
      ["READY", "REVIEW_REQUIRED", "REJECTED", "FAILED", "EXTRACTED"].includes(
        processingJob.status,
      )
    ) {
      this.logger.log(`Skipping completed job ${processingJobId} (${processingJob.status})`);
      return;
    }

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId, deletionStatus: "ACTIVE" },
    });
    if (!document) {
      throw new Error("Document not found for tenant context");
    }
    if (!document.quarantineKey?.startsWith(`org/${organizationId}/`)) {
      throw new Error("Quarantine key organization mismatch");
    }

    await this.prisma.documentProcessingJob.update({
      where: { id: processingJobId },
      data: {
        status: "SCANNING",
        attemptCount: { increment: 1 },
        startedAt: processingJob.startedAt ?? new Date(),
        actorUserId,
      },
    });
    await this.prisma.document.update({
      where: { id: documentId },
      data: { processingStatus: "SCANNING", scanStatus: "PENDING" },
    });

    const quarantineBucket = process.env.S3_QUARANTINE_BUCKET ?? "opero-quarantine";
    const documentsBucket = process.env.S3_DOCUMENTS_BUCKET ?? "opero-documents";
    const buffer = await this.storage.getObjectBuffer({
      bucket: quarantineBucket,
      key: document.quarantineKey,
    });

    const scan = await this.scanner.scan(buffer);
    if (scan.verdict === "UNAVAILABLE" || scan.verdict === "ERROR") {
      await this.failClosed(documentId, processingJobId, organizationId, "SCANNER_UNAVAILABLE", scan.detail);
      throw new Error(`Scanner fail-closed: ${scan.detail ?? scan.verdict}`);
    }
    if (scan.verdict === "INFECTED") {
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          processingStatus: "REJECTED",
          scanStatus: "INFECTED",
          failureClass: "MALWARE",
          failureMessage: "Malware detected",
        },
      });
      await this.prisma.documentProcessingJob.update({
        where: { id: processingJobId },
        data: {
          status: "REJECTED",
          errorClass: "MALWARE",
          errorMessage: scan.signature ?? "infected",
          finishedAt: new Date(),
        },
      });
      // Do not promote infected objects.
      return;
    }

    await this.storage.copyObject({
      sourceBucket: quarantineBucket,
      sourceKey: document.quarantineKey,
      destinationBucket: documentsBucket,
      destinationKey: document.storageKey,
    });
    await this.storage.deleteObject({
      bucket: quarantineBucket,
      key: document.quarantineKey,
    });

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: "SCANNED",
        scanStatus: "CLEAN",
        quarantineKey: null,
      },
    });
    await this.prisma.documentProcessingJob.update({
      where: { id: processingJobId },
      data: { status: "EXTRACTING" },
    });
    await this.prisma.document.update({
      where: { id: documentId },
      data: { processingStatus: "EXTRACTING", extractionStatus: "RUNNING" },
    });

    try {
      const accepted = await this.storage.getObjectBuffer({
        bucket: documentsBucket,
        key: document.storageKey,
      });
      const extraction = await extractFinancialDocument({
        format: document.format,
        buffer: accepted,
        documentId,
      });

      await this.prisma.$transaction(async (tx) => {
        const extractionRow = await tx.documentExtraction.create({
          data: {
            organizationId,
            documentId,
            method: extraction.method,
            quality: extraction.quality,
            status: extraction.manualRequired ? "MANUAL_REQUIRED" : "SUCCEEDED",
            warnings: extraction.warnings,
            startedAt: new Date(),
            finishedAt: new Date(),
          },
        });

        for (const statement of extraction.statements) {
          const statementRow = await tx.financialStatement.create({
            data: {
              organizationId,
              documentId,
              extractionId: extractionRow.id,
              statementType: statement.statementType,
              currency: statement.currency,
              unitScale: statement.unitScale,
              periodStart: statement.periodStart ? new Date(statement.periodStart) : null,
              periodEnd: statement.periodEnd ? new Date(statement.periodEnd) : null,
              periodLabel: statement.periodLabel,
            },
          });

          for (const line of statement.lines) {
            const evidence = await tx.evidenceReference.create({
              data: {
                organizationId,
                documentId,
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
                organizationId,
                statementId: statementRow.id,
                concept: line.concept,
                labelRaw: line.labelRaw,
                rawValue: line.rawValue,
                normalizedValue: line.normalizedValue,
                currency: line.currency,
                unitScale: line.unitScale,
                extractionMethod: extraction.method,
                quality: line.quality,
                evidenceId: evidence.id,
              },
            });
          }
        }

        const nextStatus = extraction.manualRequired || extraction.quality === "LOW"
          ? "REVIEW_REQUIRED"
          : "READY";

        await tx.document.update({
          where: { id: documentId },
          data: {
            processingStatus: nextStatus,
            extractionStatus: extraction.manualRequired ? "MANUAL_REQUIRED" : "SUCCEEDED",
          },
        });
        await tx.documentProcessingJob.update({
          where: { id: processingJobId },
          data: {
            status: nextStatus,
            finishedAt: new Date(),
          },
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "extraction failed";
      await this.failClosed(documentId, processingJobId, organizationId, "PARSER", message);
      throw error;
    }
  }

  private async failClosed(
    documentId: string,
    processingJobId: string,
    organizationId: string,
    failureClass: "SCANNER_UNAVAILABLE" | "PARSER" | "INTERNAL",
    detail?: string,
  ): Promise<void> {
    await this.prisma.document.updateMany({
      where: { id: documentId, organizationId },
      data: {
        processingStatus: "FAILED",
        scanStatus: failureClass === "SCANNER_UNAVAILABLE" ? "UNAVAILABLE" : undefined,
        extractionStatus: failureClass === "PARSER" ? "FAILED" : undefined,
        failureClass,
        failureMessage: detail?.slice(0, 500) ?? failureClass,
      },
    });
    await this.prisma.documentProcessingJob.updateMany({
      where: { id: processingJobId, organizationId },
      data: {
        status: "FAILED",
        errorClass: failureClass,
        errorMessage: detail?.slice(0, 500) ?? failureClass,
        finishedAt: new Date(),
      },
    });
  }
}
