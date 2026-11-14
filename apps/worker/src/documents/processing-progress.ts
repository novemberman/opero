import { buildProcessingProgress, type DocumentProcessingProgress } from "@opero/shared";

export function progressForDocument(input: {
  documentId: string;
  organizationId: string;
  processingStatus: string;
  scanStatus: string;
  extractionStatus: string;
  failureClass?: string | null;
  attemptCount?: number;
  maxAttempts?: number;
}): DocumentProcessingProgress {
  return buildProcessingProgress({
    documentId: input.documentId,
    organizationId: input.organizationId,
    processingStatus: input.processingStatus,
    scanStatus: input.scanStatus,
    extractionStatus: input.extractionStatus,
    failureClass: input.failureClass,
    jobAttemptCount: input.attemptCount,
    jobMaxAttempts: input.maxAttempts,
  });
}
