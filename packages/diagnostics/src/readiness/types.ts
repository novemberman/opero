export type ReadinessStatus = "READY" | "PARTIALLY_READY" | "ACTION_REQUIRED" | "BLOCKED";

export type ReadinessIssueSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ReadinessChecklistItem = {
  id: string;
  label: string;
  passed: boolean;
  required: boolean;
  detail?: string;
};

export type ReadinessIssue = {
  code: string;
  severity: ReadinessIssueSeverity;
  title: string;
  detail: string;
  blocking: boolean;
};

export type ReadinessInputDocument = {
  id: string;
  processingStatus: string;
  scanStatus: string;
  deletionStatus: string;
  statementCount: number;
  lineItemCount: number;
  /**
   * Material mapped monetary figures still needing human CONFIRMED review
   * (or outstanding mandatory scale confirmation). Blocks READY.
   */
  pendingReviewCount: number;
  /**
   * Contextual / non-authoritative pending rows (UNMAPPED, non-monetary headings,
   * percentages, dates). Informational only — does not block diagnostics.
   */
  contextualPendingCount?: number;
  hasCurrency: boolean;
  hasPeriod: boolean;
  periodType: string;
  consolidationScope: string;
  metadataConfirmed: boolean;
};

export type ReadinessInput = {
  documents: ReadinessInputDocument[];
  openCriticalReconciliations: number;
  openHighReconciliations: number;
};

export type ReadinessResult = {
  status: ReadinessStatus;
  checklist: ReadinessChecklistItem[];
  issues: ReadinessIssue[];
  blockingReasons: string[];
};
