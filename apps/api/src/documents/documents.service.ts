import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import type { PrismaClient } from "@opero/database";
import { sanitizeOriginalFilename, validateDocumentBuffer } from "@opero/document-processing";
import type { ObjectStoragePort } from "@opero/object-storage";
import type { Queue } from "bullmq";
import { createHash, randomUUID } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import type { ApiEnv } from "../config/env";
import { PRISMA_CLIENT } from "../database/database.constants";
import { OBJECT_STORAGE } from "../storage/storage.constants";
import type { AuthenticatedUser } from "../types/express";
import { DOCUMENT_PROCESS_JOB, DOCUMENTS_QUEUE_NAME } from "./documents.queue";

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    private readonly audit: AuditService,
    private readonly config: ConfigService<ApiEnv, true>,
    @InjectQueue(DOCUMENTS_QUEUE_NAME) private readonly documentsQueue: Queue,
  ) {}

  private quarantineBucket(): string {
    return this.config.get("S3_QUARANTINE_BUCKET", { infer: true });
  }

  private documentsBucket(): string {
    return this.config.get("S3_DOCUMENTS_BUCKET", { infer: true });
  }

  private maxBytes(): number {
    return this.config.get("DOCUMENT_MAX_BYTES", { infer: true });
  }

  private uploadTtlMs(): number {
    return this.config.get("DOCUMENT_UPLOAD_TTL_MINUTES", { infer: true }) * 60_000;
  }

  private retentionUntil(): Date {
    const days = this.config.get("DOCUMENT_RETENTION_DAYS", { infer: true });
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private storageKey(organizationId: string, documentId: string, filename: string): string {
    const safe = sanitizeOriginalFilename(filename);
    return `org/${organizationId}/docs/${documentId}/${randomUUID()}-${safe}`;
  }

  async createUpload(input: {
    organizationId: string;
    actor: AuthenticatedUser;
    filename: string;
    declaredMimeType?: string;
    declaredFormat?: "PDF" | "XLSX" | "CSV";
    expectedByteSize?: number;
    requestId?: string;
  }) {
    if (input.expectedByteSize && input.expectedByteSize > this.maxBytes()) {
      throw new BadRequestException(`File exceeds maximum size of ${this.maxBytes()} bytes`);
    }
    const filename = sanitizeOriginalFilename(input.filename);
    const format =
      input.declaredFormat ??
      (filename.toLowerCase().endsWith(".pdf")
        ? "PDF"
        : filename.toLowerCase().endsWith(".xlsx")
          ? "XLSX"
          : "CSV");
    const documentId = randomUUID();
    const quarantineKey = this.storageKey(input.organizationId, documentId, filename);

    const upload = await this.prisma.documentUpload.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actor.id,
        declaredFilename: filename,
        declaredMimeType: input.declaredMimeType,
        declaredFormat: format,
        expectedByteSize: input.expectedByteSize ? BigInt(input.expectedByteSize) : null,
        quarantineKey,
        expiresAt: new Date(Date.now() + this.uploadTtlMs()),
      },
    });

    await this.audit.record({
      action: "document.upload_initiated",
      entityType: "document_upload",
      entityId: upload.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: { filename, format },
    });

    return {
      uploadId: upload.id,
      expiresAt: upload.expiresAt.toISOString(),
      maxBytes: this.maxBytes(),
      quarantineKeyHint: quarantineKey.startsWith(`org/${input.organizationId}/`),
    };
  }

  async completeUpload(input: {
    organizationId: string;
    uploadId: string;
    actor: AuthenticatedUser;
    buffer: Buffer;
    filename?: string;
    declaredMimeType?: string;
    requestId?: string;
  }) {
    const upload = await this.prisma.documentUpload.findFirst({
      where: { id: input.uploadId, organizationId: input.organizationId },
    });
    if (!upload) {
      throw new NotFoundException("Upload not found");
    }
    if (upload.consumedAt) {
      throw new ConflictException("Upload already completed");
    }
    if (upload.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Upload authorization expired");
    }
    if (upload.actorUserId !== input.actor.id) {
      throw new ForbiddenException("Upload session belongs to another user");
    }
    if (!upload.quarantineKey.startsWith(`org/${input.organizationId}/`)) {
      throw new ForbiddenException("Invalid storage key for organization");
    }

    const validated = await validateDocumentBuffer({
      buffer: input.buffer,
      filename: input.filename ?? upload.declaredFilename,
      declaredMimeType: input.declaredMimeType ?? upload.declaredMimeType ?? undefined,
      maxBytes: this.maxBytes(),
    });

    if (validated.format !== upload.declaredFormat) {
      throw new BadRequestException("Uploaded format does not match the declared format");
    }

    const sha256 = createHash("sha256").update(validated.buffer).digest("hex");
    const existing = await this.prisma.document.findUnique({
      where: {
        organizationId_sha256: {
          organizationId: input.organizationId,
          sha256,
        },
      },
    });
    if (existing && existing.deletionStatus === "ACTIVE") {
      throw new ConflictException("Duplicate document content already exists in this organization");
    }

    await this.storage.putObject({
      bucket: this.quarantineBucket(),
      key: upload.quarantineKey,
      body: validated.buffer,
      contentType: validated.mimeType,
    });
    const head = await this.storage.headObject({
      bucket: this.quarantineBucket(),
      key: upload.quarantineKey,
    });
    if (head.contentLength !== validated.byteSize) {
      await this.storage.deleteObject({
        bucket: this.quarantineBucket(),
        key: upload.quarantineKey,
      });
      throw new BadRequestException("Stored object size mismatch");
    }

    const documentId = randomUUID();
    const acceptedKey = this.storageKey(
      input.organizationId,
      documentId,
      validated.originalFilename,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.documentUpload.updateMany({
        where: {
          id: upload.id,
          organizationId: input.organizationId,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          consumedAt: new Date(),
          completedSha256: sha256,
          completedByteSize: BigInt(validated.byteSize),
        },
      });
      if (locked.count !== 1) {
        throw new ConflictException("Upload completion race or reuse detected");
      }

      const document = await tx.document.create({
        data: {
          id: documentId,
          organizationId: input.organizationId,
          uploadedByUserId: input.actor.id,
          originalFilename: validated.originalFilename,
          mimeType: validated.mimeType,
          format: validated.format,
          byteSize: BigInt(validated.byteSize),
          sha256,
          storageKey: acceptedKey,
          quarantineKey: upload.quarantineKey,
          processingStatus: "QUARANTINED",
          scanStatus: "PENDING",
          extractionStatus: "PENDING",
          retentionUntil: this.retentionUntil(),
        },
      });

      await tx.documentVersion.create({
        data: {
          documentId: document.id,
          organizationId: input.organizationId,
          versionNumber: 1,
          sha256,
          byteSize: BigInt(validated.byteSize),
          storageKey: acceptedKey,
          format: validated.format,
          mimeType: validated.mimeType,
        },
      });

      await tx.documentUpload.update({
        where: { id: upload.id },
        data: { documentId: document.id },
      });

      const job = await tx.documentProcessingJob.create({
        data: {
          organizationId: input.organizationId,
          documentId: document.id,
          status: "QUARANTINED",
          correlationId: input.requestId ?? null,
          actorUserId: input.actor.id,
        },
      });

      await tx.documentAccessEvent.create({
        data: {
          organizationId: input.organizationId,
          documentId: document.id,
          actorUserId: input.actor.id,
          action: "UPLOAD",
          requestId: input.requestId,
        },
      });

      return { document, job };
    });

    const bullJob = await this.documentsQueue.add(
      DOCUMENT_PROCESS_JOB,
      {
        organizationId: input.organizationId,
        documentId: result.document.id,
        processingJobId: result.job.id,
        actorUserId: input.actor.id,
        correlationId: input.requestId,
      },
      {
        jobId: result.job.id,
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );

    await this.prisma.documentProcessingJob.update({
      where: { id: result.job.id },
      data: { bullJobId: String(bullJob.id) },
    });

    await this.audit.record({
      action: "document.uploaded",
      entityType: "document",
      entityId: result.document.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: {
        format: validated.format,
        byteSize: validated.byteSize,
        sha256,
      },
    });

    return {
      documentId: result.document.id,
      processingJobId: result.job.id,
      processingStatus: result.document.processingStatus,
    };
  }

  async list(organizationId: string) {
    const documents = await this.prisma.document.findMany({
      where: { organizationId, deletionStatus: "ACTIVE" },
      orderBy: { uploadedAt: "desc" },
      select: {
        id: true,
        originalFilename: true,
        format: true,
        mimeType: true,
        byteSize: true,
        processingStatus: true,
        scanStatus: true,
        extractionStatus: true,
        uploadedAt: true,
        failureClass: true,
      },
    });
    return documents.map((doc) => ({
      ...doc,
      byteSize: Number(doc.byteSize),
    }));
  }

  async get(organizationId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId, deletionStatus: "ACTIVE" },
    });
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    return {
      ...document,
      byteSize: Number(document.byteSize),
    };
  }

  async status(organizationId: string, documentId: string) {
    const document = await this.get(organizationId, documentId);
    const job = await this.prisma.documentProcessingJob.findFirst({
      where: { organizationId, documentId },
      orderBy: { createdAt: "desc" },
    });
    return {
      documentId,
      processingStatus: document.processingStatus,
      scanStatus: document.scanStatus,
      extractionStatus: document.extractionStatus,
      failureClass: document.failureClass,
      failureMessage: document.failureMessage,
      job: job
        ? {
            id: job.id,
            status: job.status,
            attemptCount: job.attemptCount,
            errorClass: job.errorClass,
            errorMessage: job.errorMessage,
          }
        : null,
    };
  }

  async extractions(organizationId: string, documentId: string) {
    const document = await this.get(organizationId, documentId);
    if (document.scanStatus !== "CLEAN") {
      throw new ForbiddenException(
        "Extractions are not available until the document is scanned clean",
      );
    }
    const extractions = await this.prisma.documentExtraction.findMany({
      where: { organizationId, documentId },
      include: {
        statements: {
          include: {
            lineItems: {
              include: { evidence: true, reviews: { orderBy: { createdAt: "asc" } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return extractions;
  }

  async review(input: {
    organizationId: string;
    documentId: string;
    actor: AuthenticatedUser;
    lineItemId: string;
    action: "CONFIRM" | "CORRECT" | "REJECT";
    newValue?: string;
    newConcept?: string;
    reason?: string;
    requestId?: string;
  }) {
    await this.get(input.organizationId, input.documentId);
    const lineItem = await this.prisma.financialLineItem.findFirst({
      where: {
        id: input.lineItemId,
        organizationId: input.organizationId,
        statement: { documentId: input.documentId },
      },
    });
    if (!lineItem) {
      throw new NotFoundException("Line item not found");
    }

    if (input.action === "CORRECT" && !input.newValue) {
      throw new BadRequestException("newValue is required for corrections");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.extractionReview.create({
        data: {
          organizationId: input.organizationId,
          lineItemId: lineItem.id,
          actorUserId: input.actor.id,
          action: input.action,
          previousValue: lineItem.normalizedValue,
          newValue: input.action === "CORRECT" ? input.newValue : lineItem.normalizedValue,
          previousConcept: lineItem.concept,
          newConcept: (input.newConcept as never) ?? lineItem.concept,
          reason: input.reason,
        },
      });

      return tx.financialLineItem.update({
        where: { id: lineItem.id },
        data: {
          reviewStatus:
            input.action === "CONFIRM"
              ? "CONFIRMED"
              : input.action === "CORRECT"
                ? "CORRECTED"
                : "REJECTED",
          normalizedValue:
            input.action === "CORRECT" ? input.newValue! : lineItem.normalizedValue,
          concept: (input.newConcept as never) ?? lineItem.concept,
          // Preserve original extracted rawValue forever.
        },
      });
    });

    await this.prisma.documentAccessEvent.create({
      data: {
        organizationId: input.organizationId,
        documentId: input.documentId,
        actorUserId: input.actor.id,
        action: "REVIEW",
        requestId: input.requestId,
        metadata: { lineItemId: lineItem.id, action: input.action },
      },
    });

    await this.audit.record({
      action: "document.reviewed",
      entityType: "financial_line_item",
      entityId: lineItem.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: { action: input.action },
    });

    return updated;
  }

  async softDelete(input: {
    organizationId: string;
    documentId: string;
    actor: AuthenticatedUser;
    requestId?: string;
  }) {
    const document = await this.get(input.organizationId, input.documentId);
    await this.prisma.document.update({
      where: { id: document.id },
      data: {
        deletionStatus: "DELETED",
        deletedAt: new Date(),
        processingStatus: document.processingStatus,
      },
    });

    // Best-effort object removal; DB soft-delete remains authoritative for access checks.
    if (document.quarantineKey) {
      try {
        await this.storage.deleteObject({
          bucket: this.quarantineBucket(),
          key: document.quarantineKey,
        });
      } catch {
        // Already removed or never written.
      }
    }
    try {
      await this.storage.deleteObject({
        bucket: this.documentsBucket(),
        key: document.storageKey,
      });
    } catch {
      // Infected/failed uploads may never have been promoted.
    }

    await this.prisma.documentAccessEvent.create({
      data: {
        organizationId: input.organizationId,
        documentId: document.id,
        actorUserId: input.actor.id,
        action: "DELETE",
        requestId: input.requestId,
      },
    });
    await this.audit.record({
      action: "document.deleted",
      entityType: "document",
      entityId: document.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: {
        retentionUntil: document.retentionUntil?.toISOString() ?? null,
        retentionDays: this.config.get("DOCUMENT_RETENTION_DAYS", { infer: true }),
      },
    });
  }

  async authorizeDownload(input: {
    organizationId: string;
    documentId: string;
    actor: AuthenticatedUser;
    requestId?: string;
  }) {
    const document = await this.get(input.organizationId, input.documentId);
    if (document.scanStatus !== "CLEAN") {
      throw new ForbiddenException("Document is not available for download");
    }
    if (
      document.processingStatus === "REJECTED" ||
      document.processingStatus === "FAILED" ||
      document.processingStatus === "QUARANTINED" ||
      document.processingStatus === "SCANNING"
    ) {
      throw new ForbiddenException("Document is not available for download");
    }

    await this.prisma.documentAccessEvent.create({
      data: {
        organizationId: input.organizationId,
        documentId: document.id,
        actorUserId: input.actor.id,
        action: "DOWNLOAD",
        requestId: input.requestId,
      },
    });
    await this.audit.record({
      action: "document.downloaded",
      entityType: "document",
      entityId: document.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
    });

    const buffer = await this.storage.getObjectBuffer({
      bucket: this.documentsBucket(),
      key: document.storageKey,
    });
    return {
      buffer,
      filename: document.originalFilename,
      mimeType: document.mimeType,
    };
  }
}
