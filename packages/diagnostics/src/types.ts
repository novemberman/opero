export type UnitScale = "ACTUAL" | "THOUSANDS" | "MILLIONS";

export type ReviewStatus = "PENDING" | "CONFIRMED" | "CORRECTED" | "REJECTED";

export type ExtractionQuality = "HIGH" | "MEDIUM" | "LOW" | "MANUAL";

export type MetricStatus = "COMPUTED" | "UNDEFINED" | "INSUFFICIENT_INPUTS" | "INCOMPATIBLE";

export type ScoreStatus = "SCORED" | "INSUFFICIENT_DATA";

export type FindingSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH";

export type FindingCategory = "OBSERVATION" | "RISK" | "INVESTIGATION" | "DATA_QUALITY";

export type ScoreDimension =
  | "profitability"
  | "liquidity"
  | "leverage"
  | "efficiency"
  | "cash_flow";

export type SnapshotLineItem = {
  snapshotKey: string;
  lineItemId: string;
  documentId: string;
  extractionId: string;
  statementId: string;
  concept: string;
  labelRaw: string;
  rawValue: string;
  normalizedValue: string | null;
  /** Value after applying unitScale to actual units, when possible. */
  actualValue: string | null;
  currency: string | null;
  unitScale: UnitScale;
  quality: ExtractionQuality;
  reviewStatus: ReviewStatus;
  statementType: string;
  periodStart: string | null;
  periodEnd: string | null;
  periodLabel: string | null;
  evidenceReferenceId: string | null;
  evidenceKey: string | null;
};

export type DiagnosticSnapshot = {
  contentHash: string;
  currency: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  periodLabel: string | null;
  documentIds: string[];
  extractionIds: string[];
  lines: SnapshotLineItem[];
  warnings: string[];
};

export type MetricResult = {
  code: string;
  label: string;
  dimension: ScoreDimension;
  status: MetricStatus;
  value: string | null;
  unit: string | null;
  formulaId: string;
  periodStart: string | null;
  periodEnd: string | null;
  periodLabel: string | null;
  inputRefs: string[];
  warnings: string[];
};

export type QualityAssessment = {
  completeness: string;
  consistency: string;
  evidenceReliability: string;
  diagnosticCoverage: string;
  details: Record<string, unknown>;
};

export type ScoreComponentResult = {
  dimension: ScoreDimension;
  weight: number;
  included: boolean;
  score: number | null;
  exclusionReason: string | null;
  metricCodes: string[];
};

export type ScoreResult = {
  status: ScoreStatus;
  overallScore: number | null;
  methodologyVersion: string;
  components: ScoreComponentResult[];
  limitations: string[];
};

export type EvidenceLinkDraft = {
  snapshotKey: string;
  documentId: string | null;
  lineItemId: string | null;
  evidenceReferenceId: string | null;
  label: string | null;
};

export type FindingDraft = {
  ruleId: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  explanation: string;
  implication: string;
  suggestedAction: string;
  confidence: string;
  supportingMetrics: string[];
  evidence: EvidenceLinkDraft[];
};

export type DiagnosticEngineResult = {
  calculationEngineVersion: string;
  ruleSetVersion: string;
  scoreMethodologyVersion: string;
  metrics: MetricResult[];
  quality: QualityAssessment;
  score: ScoreResult;
  findings: FindingDraft[];
};
