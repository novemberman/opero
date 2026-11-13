export type ReportScore = {
  /** e.g. `SCORED` or `INSUFFICIENT_DATA`. */
  status: string;
  /** 0–100, or null when no score was produced. */
  overall: number | null;
  limitations: string[];
};

export type ReportMetric = {
  code: string;
  label: string;
  dimension: string | null;
  status: string;
  /** Plain decimal string exactly as computed, or null when unavailable. */
  value: string | null;
  unit: string | null;
  periodLabel: string | null;
};

export type ReportFinding = {
  id: string | null;
  category: string;
  severity: string;
  title: string;
  explanation: string;
  implication: string | null;
  suggestedAction: string | null;
};

export type ReportQuality = {
  completeness: string | null;
  consistency: string | null;
  evidenceReliability: string | null;
  diagnosticCoverage: string | null;
};

export type ReportAiNarrative = {
  /** True when no live model wrote the narrative. Always labelled in the PDF. */
  isSimulated: boolean;
  summary: string;
  keyObservations: string[];
  risks: string[];
  limitations: string[];
  provider: string | null;
  model: string | null;
};

/** Everything the PDF renderer needs. The renderer adds no facts of its own. */
export type ReportModel = {
  title: string;
  orgName: string;
  period: string;
  currency: string | null;
  /** ISO 8601 timestamp shown on the report and used as the PDF creation date. */
  generatedAt: string | null;
  score: ReportScore;
  metrics: ReportMetric[];
  findings: ReportFinding[];
  quality: ReportQuality;
  readinessStatus?: string;
  aiNarrative?: ReportAiNarrative;
  disclosures: string[];
  /** False unless a reviewer explicitly verified the report for publication. */
  verifiedPublication: boolean;
};
