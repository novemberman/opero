import type { ReportAiNarrativeInput, ReportSnapshotPayload } from "./assemble.js";

/** Snapshot payload shaped like a persisted diagnostic run. */
export function payloadFixture(overrides: Partial<ReportSnapshotPayload> = {}): ReportSnapshotPayload {
  return {
    organizationName: "Acme Trading Ltd",
    periodLabel: "FY2025",
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    currency: "USD",
    metrics: [
      {
        code: "CURRENT_RATIO",
        label: "Current ratio",
        dimension: "liquidity",
        status: "COMPUTED",
        value: "0.8235294117647058824",
        unit: "ratio",
        periodLabel: "FY2025",
      },
      {
        code: "WORKING_CAPITAL",
        label: "Working capital",
        dimension: "liquidity",
        status: "COMPUTED",
        value: "-18000",
        unit: "currency",
        periodLabel: "FY2025",
      },
      {
        code: "DEBT_TO_EQUITY",
        label: "Debt to equity",
        dimension: "leverage",
        status: "INSUFFICIENT_INPUTS",
        value: null,
        unit: "ratio",
        periodLabel: "FY2025",
      },
    ],
    findings: [
      {
        id: "0b0f6c5e-7c11-4c38-9f0a-3f2f2f1a0001",
        category: "RISK",
        severity: "HIGH",
        title: "Current liabilities exceed current assets",
        explanation: "Current assets do not cover current liabilities for the period.",
        implication: "Short-term obligations may be difficult to meet.",
        suggestedAction: "Review the timing of payables and receivables.",
      },
    ],
    quality: {
      completeness: "0.75",
      consistency: "1",
      evidenceReliability: "0.9",
      diagnosticCoverage: "0.6",
    },
    score: {
      status: "SCORED",
      overallScore: 54,
      methodologyVersion: "score.v1",
      limitations: [
        "score.v1 thresholds are provisional heuristics, not industry benchmarks",
        "Missing dimensions are not renormalized to hide coverage gaps",
      ],
      components: [
        {
          dimension: "liquidity",
          weight: 20,
          included: true,
          score: 40,
          exclusionReason: null,
          metricCodes: ["CURRENT_RATIO", "WORKING_CAPITAL"],
        },
        {
          dimension: "leverage",
          weight: 20,
          included: false,
          score: null,
          exclusionReason: "No eligible computed metrics for dimension",
          metricCodes: [],
        },
      ],
    },
    engineVersions: {
      calculationEngine: "calc.v1",
      ruleSet: "rules.v1",
      scoreMethodology: "score.v1",
    },
    sourceDocumentIds: ["00000000-0000-4000-8000-0000000000d1"],
    readinessStatus: "PARTIALLY_READY",
    ...overrides,
  };
}

export function aiNarrativeFixture(
  overrides: Partial<ReportAiNarrativeInput> = {},
): ReportAiNarrativeInput {
  return {
    isSimulated: true,
    provider: "mock",
    model: "mock-deterministic-v1",
    narrative: {
      summary: "Liquidity is under pressure for the period.",
      keyObservations: ["Current ratio [CURRENT_RATIO] was computed as 0.8235."],
      risks: ["Current liabilities exceed current assets (HIGH)."],
      limitations: ["Debt to equity could not be computed."],
      recommendations: ["Review the timing of payables and receivables."],
      profitabilityInterpretation: "",
      liquidityInterpretation: "Current ratio [CURRENT_RATIO] = 0.8235 ratio.",
      solvencyInterpretation: "No computed solvency metrics were available in the diagnostic facts.",
      efficiencyInterpretation: "",
      cashFlowInterpretation: "",
      dataQualityExplanation: "Completeness 0.75; consistency 1.",
      trendCommentary: "",
    },
    ...overrides,
  };
}
