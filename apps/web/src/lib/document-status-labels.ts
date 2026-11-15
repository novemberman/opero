/**
 * Human-readable labels for document processing / scan / extraction status codes.
 * Underlying status values are preserved for filtering and data attributes.
 */

const PROCESSING_LABELS: Record<string, string> = {
  UPLOADED: "Uploaded",
  QUARANTINED: "Quarantined",
  SCANNING: "Scanning",
  SCANNED: "Scanned",
  EXTRACTING: "Extracting",
  EXTRACTED: "Extracted",
  REVIEW_REQUIRED: "Review required",
  READY: "Ready",
  REJECTED: "Rejected",
  FAILED: "Failed",
  PENDING: "Pending",
  QUEUED: "Queued",
  RUNNING: "Running",
};

const SCAN_LABELS: Record<string, string> = {
  PENDING: "Pending",
  QUEUED: "Queued",
  RUNNING: "Scanning",
  CLEAN: "Clean",
  INFECTED: "Infected",
  ERROR: "Error",
  UNAVAILABLE: "Unavailable",
  SKIPPED: "Skipped",
};

const EXTRACTION_LABELS: Record<string, string> = {
  PENDING: "Pending",
  QUEUED: "Queued",
  RUNNING: "Running",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  SKIPPED: "Skipped",
  COMPLETE: "Complete",
  EXTRACTED: "Extracted",
};

export type DocumentStatusKind = "processing" | "scan" | "extraction";

function titleCaseFallback(status: string): string {
  return status
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function documentStatusLabel(kind: DocumentStatusKind, status: string): string {
  const key = status.toUpperCase();
  const map =
    kind === "processing"
      ? PROCESSING_LABELS
      : kind === "scan"
        ? SCAN_LABELS
        : EXTRACTION_LABELS;
  return map[key] ?? titleCaseFallback(status);
}

export function documentStatusTone(
  status: string,
): "neutral" | "success" | "warning" | "error" | "info" | "emerald" {
  const value = status.toUpperCase();
  if (["READY", "SUCCEEDED", "CLEAN", "COMPLETE", "EXTRACTED", "SCANNED"].includes(value)) {
    return "success";
  }
  if (
    ["REVIEW_REQUIRED", "PENDING", "QUEUED", "RUNNING", "SCANNING", "EXTRACTING", "UPLOADED", "QUARANTINED"].includes(
      value,
    )
  ) {
    return "warning";
  }
  if (["FAILED", "REJECTED", "INFECTED", "ERROR", "UNAVAILABLE"].includes(value)) {
    return "error";
  }
  return "neutral";
}
