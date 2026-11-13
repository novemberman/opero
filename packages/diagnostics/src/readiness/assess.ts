import type {
  ReadinessChecklistItem,
  ReadinessInput,
  ReadinessIssue,
  ReadinessResult,
  ReadinessStatus,
} from "./types.js";

function deriveStatus(issues: ReadinessIssue[], checklist: ReadinessChecklistItem[]): ReadinessStatus {
  if (issues.some((i) => i.blocking) || checklist.some((c) => c.required && !c.passed)) {
    return "BLOCKED";
  }
  const actionRequired = issues.some((i) => i.severity === "HIGH" || i.severity === "MEDIUM");
  if (actionRequired || checklist.some((c) => !c.passed)) {
    return checklist.every((c) => c.passed || !c.required) && !actionRequired
      ? "PARTIALLY_READY"
      : "ACTION_REQUIRED";
  }
  if (issues.some((i) => i.severity === "LOW" || i.severity === "INFO")) {
    return "PARTIALLY_READY";
  }
  return "READY";
}

/**
 * Deterministic readiness assessment for diagnostic runs / pre-run checks.
 * Does not mutate scores; gates publication when BLOCKED.
 */
export function assessReadiness(input: ReadinessInput): ReadinessResult {
  const issues: ReadinessIssue[] = [];
  const checklist: ReadinessChecklistItem[] = [];

  const docs = input.documents;
  checklist.push({
    id: "documents_present",
    label: "At least one document selected",
    passed: docs.length > 0,
    required: true,
    detail: docs.length === 0 ? "Select one or more financial documents" : undefined,
  });

  const activeClean = docs.filter(
    (d) => d.deletionStatus === "ACTIVE" && d.scanStatus === "CLEAN",
  );
  checklist.push({
    id: "documents_clean",
    label: "Documents are active and clean-scanned",
    passed: docs.length > 0 && activeClean.length === docs.length,
    required: true,
    detail:
      activeClean.length !== docs.length
        ? "One or more documents are not active or failed malware scan"
        : undefined,
  });

  const readyStatus = docs.filter((d) =>
    ["READY", "EXTRACTED", "REVIEW_REQUIRED"].includes(d.processingStatus),
  );
  checklist.push({
    id: "documents_extracted",
    label: "Documents have extracted statements",
    passed: docs.length > 0 && readyStatus.length === docs.length && docs.every((d) => d.statementCount > 0),
    required: true,
  });

  const withLines = docs.filter((d) => d.lineItemCount > 0);
  checklist.push({
    id: "line_items_present",
    label: "Extracted line items are available",
    passed: docs.length > 0 && withLines.length === docs.length,
    required: true,
  });

  const pendingReviews = docs.reduce((n, d) => n + d.pendingReviewCount, 0);
  checklist.push({
    id: "reviews_complete",
    label: "No pending line-item reviews",
    passed: pendingReviews === 0,
    required: false,
    detail: pendingReviews > 0 ? `${pendingReviews} line item(s) still pending review` : undefined,
  });
  if (pendingReviews > 0) {
    issues.push({
      code: "PENDING_REVIEWS",
      severity: "MEDIUM",
      title: "Pending extraction reviews",
      detail: `${pendingReviews} line item(s) have not been confirmed or corrected`,
      blocking: false,
    });
  }

  const missingCurrency = docs.filter((d) => !d.hasCurrency);
  checklist.push({
    id: "currency_present",
    label: "Currency present on statements",
    passed: missingCurrency.length === 0 && docs.length > 0,
    required: true,
  });
  if (missingCurrency.length) {
    issues.push({
      code: "MISSING_CURRENCY",
      severity: "CRITICAL",
      title: "Missing currency metadata",
      detail: `${missingCurrency.length} document(s) lack currency`,
      blocking: true,
    });
  }

  const missingPeriod = docs.filter((d) => !d.hasPeriod);
  checklist.push({
    id: "period_present",
    label: "Period present on statements",
    passed: missingPeriod.length === 0 && docs.length > 0,
    required: true,
  });
  if (missingPeriod.length) {
    issues.push({
      code: "MISSING_PERIOD",
      severity: "CRITICAL",
      title: "Missing period metadata",
      detail: `${missingPeriod.length} document(s) lack period start/end or label`,
      blocking: true,
    });
  }

  const unknownPeriodType = docs.filter((d) => d.periodType === "UNKNOWN");
  checklist.push({
    id: "period_type_known",
    label: "Period type confirmed",
    passed: unknownPeriodType.length === 0 && docs.length > 0,
    required: false,
  });
  if (unknownPeriodType.length) {
    issues.push({
      code: "UNKNOWN_PERIOD_TYPE",
      severity: "LOW",
      title: "Period type unknown",
      detail: "Confirm monthly/quarterly/annual period type before publishing verified reports",
      blocking: false,
    });
  }

  const unconfirmedMeta = docs.filter((d) => !d.metadataConfirmed);
  checklist.push({
    id: "metadata_confirmed",
    label: "Statement metadata confirmed",
    passed: unconfirmedMeta.length === 0 && docs.length > 0,
    required: false,
  });
  if (unconfirmedMeta.length) {
    issues.push({
      code: "METADATA_UNCONFIRMED",
      severity: "MEDIUM",
      title: "Statement metadata not confirmed",
      detail: `${unconfirmedMeta.length} document(s) need metadata review`,
      blocking: false,
    });
  }

  checklist.push({
    id: "no_critical_conflicts",
    label: "No unresolved critical evidence conflicts",
    passed: input.openCriticalReconciliations === 0,
    required: true,
  });
  if (input.openCriticalReconciliations > 0) {
    issues.push({
      code: "CRITICAL_RECONCILIATIONS",
      severity: "CRITICAL",
      title: "Unresolved critical evidence conflicts",
      detail: `${input.openCriticalReconciliations} critical conflict(s) remain open`,
      blocking: true,
    });
  }

  if (input.openHighReconciliations > 0) {
    issues.push({
      code: "HIGH_RECONCILIATIONS",
      severity: "HIGH",
      title: "Unresolved high-severity evidence conflicts",
      detail: `${input.openHighReconciliations} high-severity conflict(s) remain open`,
      blocking: false,
    });
  }

  if (docs.length === 0) {
    issues.push({
      code: "NO_DOCUMENTS",
      severity: "CRITICAL",
      title: "No documents selected",
      detail: "Select documents before assessing readiness",
      blocking: true,
    });
  }

  const status = deriveStatus(issues, checklist);
  const blockingReasons = issues.filter((i) => i.blocking).map((i) => i.title);

  return { status, checklist, issues, blockingReasons };
}
