/**
 * User-facing document processing progress contract (Phase 8).
 * Stages map onto existing DocumentProcessingStatus / job work — not separate queues.
 */

export const PROCESSING_STAGES = [
  "UPLOADING",
  "SECURITY_SCANNING",
  "READING_STATEMENTS",
  "IDENTIFYING_FIGURES",
  "CHECKING_DATA_QUALITY",
  "AWAITING_REVIEW",
  "CALCULATING_DIAGNOSTICS",
  "PREPARING_RESULTS",
  "READY_FOR_NEXT_ACTION",
] as const;

export type ProcessingStageId = (typeof PROCESSING_STAGES)[number];

export const PROCESSING_STAGE_LABELS: Record<ProcessingStageId, string> = {
  UPLOADING: "Uploading document",
  SECURITY_SCANNING: "Security scanning",
  READING_STATEMENTS: "Reading financial statements",
  IDENTIFYING_FIGURES: "Identifying financial figures and units",
  CHECKING_DATA_QUALITY: "Checking data quality",
  AWAITING_REVIEW: "Awaiting user review",
  CALCULATING_DIAGNOSTICS: "Calculating financial diagnostics",
  PREPARING_RESULTS: "Preparing analysis results",
  READY_FOR_NEXT_ACTION: "Ready for next action",
};

export type StageStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";

export type ProcessingStageSnapshot = {
  id: ProcessingStageId;
  label: string;
  status: StageStatus;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type DocumentProcessingProgress = {
  documentId: string;
  organizationId: string;
  currentStage: ProcessingStageId;
  stageStatus: StageStatus;
  overallStatus: string;
  /** Null when progress is indeterminate. Never 100 while required work remains. */
  progressPercent: number | null;
  stages: ProcessingStageSnapshot[];
  stageStartedAt: string | null;
  stageCompletedAt: string | null;
  lastUpdatedAt: string;
  errorCategory: string | null;
  retryAvailable: boolean;
  humanActionRequired: boolean;
  nextRecommendedAction: string | null;
};

const TERMINAL_DOC_STATUSES = new Set([
  "READY",
  "REVIEW_REQUIRED",
  "REJECTED",
  "FAILED",
]);

/**
 * Map persisted document/job fields to the user-facing progress contract.
 * Idempotent and safe for polling after refresh.
 */
export function buildProcessingProgress(input: {
  documentId: string;
  organizationId: string;
  processingStatus: string;
  scanStatus: string;
  extractionStatus: string;
  failureClass?: string | null;
  failureMessage?: string | null;
  jobAttemptCount?: number;
  jobMaxAttempts?: number;
  persistedProgress?: Partial<DocumentProcessingProgress> | null;
  now?: Date;
}): DocumentProcessingProgress {
  const now = (input.now ?? new Date()).toISOString();
  const status = input.processingStatus;

  let currentStage: ProcessingStageId = "UPLOADING";
  let stageStatus: StageStatus = "RUNNING";
  let progressPercent: number | null = 5;
  let humanActionRequired = false;
  let nextRecommendedAction: string | null = "Wait for upload to finish";
  let errorCategory: string | null = input.failureClass ?? null;

  switch (status) {
    case "UPLOADED":
    case "QUARANTINED":
      currentStage = "UPLOADING";
      progressPercent = 10;
      nextRecommendedAction = "Waiting for security scan to start";
      break;
    case "SCANNING":
      currentStage = "SECURITY_SCANNING";
      progressPercent = 25;
      nextRecommendedAction = "Antivirus scan in progress";
      break;
    case "SCANNED":
      currentStage = "READING_STATEMENTS";
      progressPercent = 40;
      nextRecommendedAction = "Preparing extraction";
      break;
    case "EXTRACTING":
      currentStage = "IDENTIFYING_FIGURES";
      progressPercent = 55;
      nextRecommendedAction = "Extracting figures and units";
      break;
    case "EXTRACTED":
      currentStage = "CHECKING_DATA_QUALITY";
      progressPercent = 70;
      nextRecommendedAction = "Validating extracted figures";
      break;
    case "REVIEW_REQUIRED":
      currentStage = "AWAITING_REVIEW";
      stageStatus = "RUNNING";
      progressPercent = 80;
      humanActionRequired = true;
      nextRecommendedAction = "Review extracted figures and confirm monetary units";
      break;
    case "READY":
      currentStage = "READY_FOR_NEXT_ACTION";
      stageStatus = "COMPLETED";
      progressPercent = 100;
      nextRecommendedAction = "Continue to readiness or diagnostics";
      break;
    case "REJECTED":
      currentStage = "SECURITY_SCANNING";
      stageStatus = "FAILED";
      progressPercent = null;
      errorCategory = input.failureClass ?? "MALWARE";
      nextRecommendedAction = "Upload a clean document";
      break;
    case "FAILED":
      currentStage =
        input.scanStatus === "UNAVAILABLE" || input.scanStatus === "ERROR"
          ? "SECURITY_SCANNING"
          : "IDENTIFYING_FIGURES";
      stageStatus = "FAILED";
      progressPercent = null;
      errorCategory = input.failureClass ?? "INTERNAL";
      nextRecommendedAction = "Retry processing or contact support";
      break;
    default:
      currentStage = "UPLOADING";
      progressPercent = null;
      nextRecommendedAction = "Processing";
  }

  // Never report 100% while work remains.
  if (!TERMINAL_DOC_STATUSES.has(status) || status === "REVIEW_REQUIRED") {
    if (progressPercent === 100) progressPercent = 99;
  }
  if (status === "REVIEW_REQUIRED") {
    progressPercent = 80;
  }

  const order = PROCESSING_STAGES;
  const currentIdx = order.indexOf(currentStage);
  const stages: ProcessingStageSnapshot[] = order.map((id, idx) => {
    let s: StageStatus = "PENDING";
    if (stageStatus === "FAILED" && id === currentStage) s = "FAILED";
    else if (idx < currentIdx) s = "COMPLETED";
    else if (idx === currentIdx) s = stageStatus === "FAILED" ? "FAILED" : stageStatus;
    // Diagnostics / preparing results are post-document gates — mark skipped until READY.
    if (
      (id === "CALCULATING_DIAGNOSTICS" || id === "PREPARING_RESULTS") &&
      status !== "READY"
    ) {
      s = status === "READY" ? "COMPLETED" : "SKIPPED";
    }
    if (status === "READY" && (id === "CALCULATING_DIAGNOSTICS" || id === "PREPARING_RESULTS")) {
      // Document-ready does not mean diagnostics ran.
      s = "SKIPPED";
    }
    return {
      id,
      label: PROCESSING_STAGE_LABELS[id],
      status: s,
      startedAt: idx === currentIdx ? input.persistedProgress?.stageStartedAt ?? now : null,
      completedAt: idx < currentIdx ? now : null,
    };
  });

  const retryAvailable =
    stageStatus === "FAILED" &&
    (input.jobAttemptCount ?? 0) < (input.jobMaxAttempts ?? 5) &&
    errorCategory !== "MALWARE";

  return {
    documentId: input.documentId,
    organizationId: input.organizationId,
    currentStage,
    stageStatus,
    overallStatus: status,
    progressPercent,
    stages,
    stageStartedAt: input.persistedProgress?.stageStartedAt ?? now,
    stageCompletedAt: stageStatus === "COMPLETED" || stageStatus === "FAILED" ? now : null,
    lastUpdatedAt: now,
    errorCategory,
    retryAvailable,
    humanActionRequired,
    nextRecommendedAction,
  };
}
