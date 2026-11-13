export type ReconciliationSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ConflictCandidate = {
  documentId: string | null;
  lineItemId: string | null;
  snapshotKey: string;
  label: string;
  value: string | null;
  currency: string | null;
  periodLabel: string | null;
  reviewStatus: string;
};

export type EvidenceConflict = {
  conflictKey: string;
  concept: string;
  severity: ReconciliationSeverity;
  title: string;
  explanation: string;
  candidates: ConflictCandidate[];
};

export type ReconciliationResolutionInput = {
  conflictKey: string;
  resolution: "SELECT_AUTHORITATIVE" | "CORRECT_VALUE" | "DISMISS";
  selectedLineItemId?: string | null;
  correctedValue?: string | null;
  reason: string;
};
