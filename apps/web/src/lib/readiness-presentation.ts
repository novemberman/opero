export type ReadinessStatus = "READY" | "PARTIALLY_READY" | "ACTION_REQUIRED" | "BLOCKED";

export type ReadinessIssueInput = {
  code: string;
  severity: string;
  title: string;
  detail: string;
  blocking: boolean;
};

export type ReadinessAction = {
  label: string;
  href: string;
  reason: string;
};

const STATUS_COPY: Record<
  ReadinessStatus,
  { headline: string; explanation: string; tone: "success" | "warning" | "error" | "info" }
> = {
  READY: {
    headline: "Ready to report",
    explanation: "Every required check passed. A report can be created from this evidence scope.",
    tone: "success",
  },
  PARTIALLY_READY: {
    headline: "Partially ready",
    explanation:
      "Usable with minor gaps that should be disclosed on a report. No blocking failures remain.",
    tone: "info",
  },
  ACTION_REQUIRED: {
    headline: "Action required",
    explanation:
      "Not blocked, but issues should be resolved before treating this evidence as report-ready.",
    tone: "warning",
  },
  BLOCKED: {
    headline: "Blocked",
    explanation:
      "A required check failed. Report creation and publication stay gated until blockers are cleared.",
    tone: "error",
  },
};

export function readinessStatusPresentation(status: string) {
  if (status in STATUS_COPY) {
    return { status: status as ReadinessStatus, ...STATUS_COPY[status as ReadinessStatus] };
  }
  return {
    status: status as ReadinessStatus,
    headline: status,
    explanation: "Readiness status from the latest assessment.",
    tone: "neutral" as const,
  };
}

/**
 * Map readiness issue codes to existing review workflows.
 * Does not invent remediation steps beyond linked routes.
 */
export function readinessIssueAction(
  issue: ReadinessIssueInput,
  ctx: { orgId: string; documentIds: string[]; diagnosticRunId: string | null },
): ReadinessAction | null {
  const docsBase = `/organizations/${ctx.orgId}/documents`;
  const firstDoc = ctx.documentIds[0];
  const reconciliations = ctx.diagnosticRunId
    ? `/organizations/${ctx.orgId}/reconciliations?run=${ctx.diagnosticRunId}`
    : `/organizations/${ctx.orgId}/reconciliations`;

  switch (issue.code) {
    case "PENDING_REVIEWS":
    case "METADATA_UNCONFIRMED":
    case "MISSING_CURRENCY":
    case "MISSING_PERIOD":
    case "UNKNOWN_PERIOD_TYPE":
      return {
        label: firstDoc ? "Open document review" : "Go to documents",
        href: firstDoc ? `${docsBase}/${firstDoc}` : docsBase,
        reason: "Confirm extraction lines and statement metadata on the source documents.",
      };
    case "CRITICAL_RECONCILIATIONS":
    case "HIGH_RECONCILIATIONS":
      return {
        label: "Review reconciliations",
        href: reconciliations,
        reason: "Resolve evidence conflicts before publishing.",
      };
    case "NO_DOCUMENTS":
      return {
        label: "Upload documents",
        href: docsBase,
        reason: "Select or upload financial statements to assess.",
      };
    default:
      return firstDoc
        ? {
            label: "Review source documents",
            href: `${docsBase}/${firstDoc}`,
            reason: "Inspect the selected evidence scope.",
          }
        : {
            label: "Open documents",
            href: docsBase,
            reason: "Inspect the selected evidence scope.",
          };
  }
}

export function groupChecklist<T extends { required: boolean; passed: boolean }>(items: T[]) {
  return {
    requiredFailed: items.filter((i) => i.required && !i.passed),
    requiredPassed: items.filter((i) => i.required && i.passed),
    optionalFailed: items.filter((i) => !i.required && !i.passed),
    optionalPassed: items.filter((i) => !i.required && i.passed),
  };
}
