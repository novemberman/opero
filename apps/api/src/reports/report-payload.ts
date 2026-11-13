import {
  assembleReportModel,
  type ReportAiNarrativeInput,
  type ReportModel,
  type ReportPayloadFinding,
  type ReportPayloadMetric,
} from "@opero/reports";

export type StoredReportAiClaim = {
  text: string;
  groundedMetricCodes: string[];
  groundedFindingIds: string[];
};

export type StoredReportAiNarrative = ReportAiNarrativeInput & {
  aiInterpretationVersionId: string;
  /** True when a reviewer edited the generated text. */
  humanEdited: boolean;
  /** Claims the grounding check could not trace to a metric or finding. */
  unsupportedClaimCount: number;
  /** Structured claims retained for re-validation at approve/publish. */
  claims: StoredReportAiClaim[];
};

export type StoredReadinessIssue = { code: string; severity: string; title: string };

/**
 * Immutable content of a report version, frozen when the version is created.
 * It holds diagnostic results only: no document bytes, line items or evidence.
 */
export type StoredReportPayload = {
  schemaVersion: 1;
  title: string;
  diagnosticRunId: string;
  snapshotContentHash: string | null;
  engineVersions: { calculationEngine: string; ruleSet: string; scoreMethodology: string };
  organizationName: string;
  periodLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string | null;
  metrics: ReportPayloadMetric[];
  findings: ReportPayloadFinding[];
  quality: {
    completeness: string;
    consistency: string;
    evidenceReliability: string;
    diagnosticCoverage: string;
  };
  score: {
    status: string;
    overallScore: number | null;
    methodologyVersion: string;
    limitations: string[];
  };
  readinessStatus: string;
  readiness: { assessmentId: string; issues: StoredReadinessIssue[] };
  aiNarrative: StoredReportAiNarrative | null;
};

/** Decisions taken at publication, stored on the version beside the snapshot. */
export type ReportPublication = {
  verifiedPublication: boolean;
  /** ISO timestamp printed on the PDF. */
  generatedAt: string;
  additionalDisclosures: string[];
  /** Full disclosure list as rendered, for display without re-rendering. */
  rendered: string[];
  /** Grounding validation of the exact narrative at publish time. */
  groundingValidation?: {
    version: string;
    validatedAt: string;
    passed: boolean;
    criticalCount: number;
    highCount: number;
    unsupportedClaimCount: number;
  } | null;
};

/** A report without a produced score can never be presented as verified. */
export function canBeVerified(payload: StoredReportPayload): boolean {
  return payload.score.status === "SCORED" && typeof payload.score.overallScore === "number";
}

export function additionalDisclosures(
  payload: StoredReportPayload,
  readiness: { status: string; issues: StoredReadinessIssue[] },
): string[] {
  const disclosures: string[] = [];
  if (readiness.status !== "READY") {
    const titles = readiness.issues.map((issue) => issue.title).join("; ");
    disclosures.push(
      `Diagnostic readiness was ${readiness.status} when this report was prepared${titles ? `: ${titles}` : ""}.`,
    );
  }
  if (payload.aiNarrative?.humanEdited) {
    disclosures.push("The interpretation text was edited by a reviewer.");
  }
  if (payload.aiNarrative && payload.aiNarrative.unsupportedClaimCount > 0) {
    disclosures.push(
      `${payload.aiNarrative.unsupportedClaimCount} statement(s) in the generated interpretation could not be traced to a diagnostic metric or finding.`,
    );
  }
  return disclosures;
}

/**
 * Builds the render model for a version. Without a publication record the
 * result is a non-verified draft preview.
 */
export function buildReportModel(
  payload: StoredReportPayload,
  publication: Pick<
    ReportPublication,
    "verifiedPublication" | "generatedAt" | "additionalDisclosures"
  > | null,
): ReportModel {
  return assembleReportModel(payload, {
    title: payload.title,
    aiNarrative: payload.aiNarrative,
    verifiedPublication: publication?.verifiedPublication === true && canBeVerified(payload),
    additionalDisclosures:
      publication?.additionalDisclosures ??
      additionalDisclosures(payload, {
        status: payload.readinessStatus,
        issues: payload.readiness.issues,
      }),
    generatedAt: publication?.generatedAt ?? null,
  });
}

export function reportStorageKey(
  organizationId: string,
  reportId: string,
  versionId: string,
): string {
  return `org/${organizationId}/reports/${reportId}/${versionId}.pdf`;
}
