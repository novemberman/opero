import type { AiContextInput } from "./context.js";
import type { AiNarrative } from "./schema.js";

export const FINDING_LIQUIDITY_ID = "0b0f6c5e-7c11-4c38-9f0a-3f2f2f1a0001";
export const FINDING_COVERAGE_ID = "0b0f6c5e-7c11-4c38-9f0a-3f2f2f1a0002";

/** Diagnostic facts shaped like `DiagnosticEngineResult` plus persisted finding ids. */
export function factsFixture(overrides: Partial<AiContextInput> = {}): AiContextInput {
  return {
    currency: "USD",
    organizationName: "Acme Trading Ltd",
    periodLabel: "FY2025",
    metrics: [
      {
        code: "CURRENT_RATIO",
        label: "Current ratio",
        dimension: "liquidity",
        status: "COMPUTED",
        value: "0.82",
        unit: "ratio",
        periodLabel: "FY2025",
        warnings: [],
      },
      {
        code: "NET_MARGIN",
        label: "Net margin",
        dimension: "profitability",
        status: "COMPUTED",
        value: "0.071",
        unit: "ratio",
        periodLabel: "FY2025",
        warnings: [],
      },
      {
        code: "WORKING_CAPITAL",
        label: "Working capital",
        dimension: "liquidity",
        status: "COMPUTED",
        value: "-18000",
        unit: "currency",
        periodLabel: "FY2025",
        warnings: [],
      },
      {
        code: "DEBT_TO_EQUITY",
        label: "Debt to equity",
        dimension: "leverage",
        status: "INSUFFICIENT_INPUTS",
        value: null,
        unit: "ratio",
        periodLabel: "FY2025",
        warnings: ["INTEREST_BEARING_DEBT not provided"],
      },
    ],
    findings: [
      {
        id: FINDING_LIQUIDITY_ID,
        ruleId: "CA_LT_CL",
        category: "RISK",
        severity: "HIGH",
        title: "Current liabilities exceed current assets",
        explanation: "Current assets do not cover current liabilities for the period.",
        implication: "Short-term obligations may be difficult to meet.",
        suggestedAction: "Review the timing of payables and receivables.",
        supportingMetrics: ["WORKING_CAPITAL", "CURRENT_RATIO"],
      },
      {
        id: FINDING_COVERAGE_ID,
        ruleId: "WEAK_COVERAGE",
        category: "DATA_QUALITY",
        severity: "LOW",
        title: "Weak evidence coverage preventing reliable assessment",
        explanation: "Several metrics could not be computed from the reviewed evidence.",
        implication: "Conclusions are limited to the computed metrics.",
        suggestedAction: "Upload the missing statements.",
        supportingMetrics: [],
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
      components: [
        { dimension: "liquidity", included: true, score: 40, exclusionReason: null },
        {
          dimension: "leverage",
          included: false,
          score: null,
          exclusionReason: "No eligible computed metrics for dimension",
        },
      ],
      limitations: ["score.v1 thresholds are provisional heuristics, not industry benchmarks"],
    },
    limitations: ["Debt to equity could not be computed"],
    ...overrides,
  };
}

/** A well-formed narrative whose every claim cites facts from `factsFixture`. */
export function narrativeFixture(overrides: Partial<AiNarrative> = {}): AiNarrative {
  return {
    summary: "Liquidity is under pressure while the business remains profitable.",
    keyObservations: ["Current ratio is 0.82."],
    risks: ["Current liabilities exceed current assets."],
    limitations: ["Debt to equity could not be computed."],
    claims: [
      {
        text: "The current ratio is 0.82.",
        groundedMetricCodes: ["CURRENT_RATIO"],
        groundedFindingIds: [],
      },
      {
        text: "Current liabilities exceed current assets.",
        groundedMetricCodes: ["WORKING_CAPITAL"],
        groundedFindingIds: [FINDING_LIQUIDITY_ID],
      },
    ],
    ...overrides,
  };
}
