/**
 * Presentation rules for Business Health Score.
 * Never calculates or overrides the score — only reflects backend eligibility.
 */

export type ScoreComponentInput = {
  dimension: string;
  weight: number;
  included: boolean;
  score: number | null;
  exclusionReason: string | null;
  metricCodes?: string[];
};

export type ScoreInput = {
  status: string;
  overallScore: number | null;
  limitations?: string[] | null;
  components?: ScoreComponentInput[] | null;
};

export type HealthScoreKind = "scored" | "withheld" | "pending" | "unavailable";

export type HealthScorePresentation = {
  kind: HealthScoreKind;
  /** Numeric score text when eligible; null when withheld/pending/unavailable */
  scoreText: string | null;
  headline: string;
  explanation: string;
  badgeLabel: string;
  badgeTone: "success" | "warning" | "error" | "neutral" | "info";
  limitations: string[];
  includedComponents: ScoreComponentInput[];
  excludedComponents: ScoreComponentInput[];
};

export function resolveHealthScorePresentation(input: {
  runStatus: string | null | undefined;
  score: ScoreInput | null | undefined;
}): HealthScorePresentation {
  const runStatus = input.runStatus ?? null;
  const score = input.score ?? null;
  const components = score?.components ?? [];
  const included = components.filter((c) => c.included);
  const excluded = components.filter((c) => !c.included);
  const limitations = score?.limitations ?? [];

  if (runStatus === "QUEUED" || runStatus === "RUNNING") {
    return {
      kind: "pending",
      scoreText: null,
      headline: "Score pending",
      explanation:
        "The Business Health Score appears only after the diagnostic run completes and the backend declares it eligible.",
      badgeLabel: "Pending",
      badgeTone: "info",
      limitations,
      includedComponents: included,
      excludedComponents: excluded,
    };
  }

  if (!score) {
    return {
      kind: "unavailable",
      scoreText: null,
      headline: "Score unavailable",
      explanation:
        "No Business Health Score payload was returned for this run. Diagnostics metrics and findings may still be available.",
      badgeLabel: "Unavailable",
      badgeTone: "neutral",
      limitations,
      includedComponents: included,
      excludedComponents: excluded,
    };
  }

  if (score.status === "SCORED" && score.overallScore != null) {
    return {
      kind: "scored",
      scoreText: String(score.overallScore),
      headline: "Business Health Score",
      explanation:
        "A provisional composite of included diagnostic dimensions from reviewed financial evidence. It is not a credit rating, audit opinion, or prediction of business survival.",
      badgeLabel: "Eligible",
      badgeTone: "success",
      limitations,
      includedComponents: included,
      excludedComponents: excluded,
    };
  }

  return {
    kind: "withheld",
    scoreText: null,
    headline: "Score withheld",
    explanation:
      "The backend did not declare this run eligible for a Business Health Score. Quality, coverage or consistency thresholds were not met — the frontend never invents a substitute figure.",
    badgeLabel: score.status === "INSUFFICIENT_DATA" ? "Insufficient data" : score.status,
    badgeTone: "warning",
    limitations,
    includedComponents: included,
    excludedComponents: excluded,
  };
}
