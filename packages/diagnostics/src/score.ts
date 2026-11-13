import { d } from "./decimal.js";
import type { MetricResult, QualityAssessment, ScoreComponentResult, ScoreDimension, ScoreResult } from "./types.js";
import {
  SCORE_METHODOLOGY_VERSION,
  SCORE_MIN_CONSISTENCY,
  SCORE_MIN_COVERAGE,
  SCORE_MIN_DIMENSIONS,
  SCORE_MIN_RELIABILITY,
} from "./versions.js";

const WEIGHTS: Record<ScoreDimension, number> = {
  profitability: 25,
  liquidity: 20,
  leverage: 20,
  efficiency: 15,
  cash_flow: 20,
};

/** Provisional heuristic bands — not industry benchmarks. */
function bandScore(value: number, bands: Array<{ max: number; score: number }>): number {
  for (const band of bands) {
    if (value < band.max) return band.score;
  }
  return bands[bands.length - 1]?.score ?? 50;
}

function metricValue(metrics: MetricResult[], code: string): number | null {
  const m = metrics.find((x) => x.code === code && x.status === "COMPUTED" && x.value != null);
  if (!m?.value) return null;
  return Number(m.value);
}

function scoreProfitability(metrics: MetricResult[]): { score: number | null; codes: string[] } {
  const codes: string[] = [];
  const parts: number[] = [];
  const net = metricValue(metrics, "NET_MARGIN");
  if (net != null) {
    codes.push("NET_MARGIN");
    // provisional: <0 weak, 0-0.05 watch, 0.05-0.15 adequate, else strong
    parts.push(bandScore(net, [{ max: 0, score: 25 }, { max: 0.05, score: 45 }, { max: 0.15, score: 70 }, { max: Infinity, score: 85 }]));
  }
  const op = metricValue(metrics, "OPERATING_MARGIN");
  if (op != null) {
    codes.push("OPERATING_MARGIN");
    parts.push(bandScore(op, [{ max: 0, score: 25 }, { max: 0.05, score: 50 }, { max: 0.12, score: 70 }, { max: Infinity, score: 85 }]));
  }
  const growth = metricValue(metrics, "REVENUE_GROWTH");
  if (growth != null) {
    codes.push("REVENUE_GROWTH");
    parts.push(bandScore(growth, [{ max: -0.05, score: 30 }, { max: 0, score: 45 }, { max: 0.1, score: 65 }, { max: Infinity, score: 80 }]));
  }
  if (!parts.length) return { score: null, codes };
  return { score: Math.round(parts.reduce((a, b) => a + b, 0) / parts.length), codes };
}

function scoreLiquidity(metrics: MetricResult[]): { score: number | null; codes: string[] } {
  const codes: string[] = [];
  const parts: number[] = [];
  const current = metricValue(metrics, "CURRENT_RATIO");
  if (current != null) {
    codes.push("CURRENT_RATIO");
    parts.push(bandScore(current, [{ max: 1, score: 25 }, { max: 1.5, score: 55 }, { max: 3, score: 80 }, { max: Infinity, score: 70 }]));
  }
  const quick = metricValue(metrics, "QUICK_RATIO");
  if (quick != null) {
    codes.push("QUICK_RATIO");
    parts.push(bandScore(quick, [{ max: 0.8, score: 25 }, { max: 1, score: 50 }, { max: 2, score: 80 }, { max: Infinity, score: 70 }]));
  }
  const wc = metricValue(metrics, "WORKING_CAPITAL");
  if (wc != null) {
    codes.push("WORKING_CAPITAL");
    parts.push(wc >= 0 ? 75 : 30);
  }
  if (!parts.length) return { score: null, codes };
  return { score: Math.round(parts.reduce((a, b) => a + b, 0) / parts.length), codes };
}

function scoreLeverage(metrics: MetricResult[]): { score: number | null; codes: string[] } {
  const codes: string[] = [];
  const parts: number[] = [];
  const la = metricValue(metrics, "LIABILITIES_TO_ASSETS");
  if (la != null) {
    codes.push("LIABILITIES_TO_ASSETS");
    parts.push(bandScore(la, [{ max: 0.4, score: 85 }, { max: 0.6, score: 65 }, { max: 0.8, score: 40 }, { max: Infinity, score: 20 }]));
  }
  const de = metricValue(metrics, "DEBT_TO_EQUITY");
  if (de != null) {
    codes.push("DEBT_TO_EQUITY");
    parts.push(bandScore(de, [{ max: 0.5, score: 85 }, { max: 1, score: 65 }, { max: 2, score: 40 }, { max: Infinity, score: 20 }]));
  }
  const ic = metricValue(metrics, "INTEREST_COVERAGE");
  if (ic != null) {
    codes.push("INTEREST_COVERAGE");
    parts.push(bandScore(ic, [{ max: 1, score: 20 }, { max: 2, score: 40 }, { max: 4, score: 65 }, { max: Infinity, score: 85 }]));
  }
  if (!parts.length) return { score: null, codes };
  return { score: Math.round(parts.reduce((a, b) => a + b, 0) / parts.length), codes };
}

function scoreEfficiency(metrics: MetricResult[]): { score: number | null; codes: string[] } {
  const codes: string[] = [];
  const parts: number[] = [];
  const dso = metricValue(metrics, "DSO");
  if (dso != null) {
    codes.push("DSO");
    parts.push(bandScore(dso, [{ max: 30, score: 85 }, { max: 45, score: 70 }, { max: 60, score: 50 }, { max: Infinity, score: 30 }]));
  }
  const ccc = metricValue(metrics, "CASH_CONVERSION_CYCLE");
  if (ccc != null) {
    codes.push("CASH_CONVERSION_CYCLE");
    parts.push(bandScore(ccc, [{ max: 30, score: 85 }, { max: 60, score: 65 }, { max: 90, score: 45 }, { max: Infinity, score: 25 }]));
  }
  if (!parts.length) return { score: null, codes };
  return { score: Math.round(parts.reduce((a, b) => a + b, 0) / parts.length), codes };
}

function scoreCashFlow(metrics: MetricResult[]): { score: number | null; codes: string[] } {
  const codes: string[] = [];
  const parts: number[] = [];
  const ocfMargin = metricValue(metrics, "OCF_MARGIN");
  if (ocfMargin != null) {
    codes.push("OCF_MARGIN");
    parts.push(bandScore(ocfMargin, [{ max: 0, score: 25 }, { max: 0.05, score: 50 }, { max: 0.15, score: 70 }, { max: Infinity, score: 85 }]));
  }
  const ocfCl = metricValue(metrics, "OCF_TO_CURRENT_LIABILITIES");
  if (ocfCl != null) {
    codes.push("OCF_TO_CURRENT_LIABILITIES");
    parts.push(bandScore(ocfCl, [{ max: 0.1, score: 30 }, { max: 0.25, score: 55 }, { max: 0.5, score: 75 }, { max: Infinity, score: 85 }]));
  }
  const fcf = metricValue(metrics, "FREE_CASH_FLOW");
  if (fcf != null) {
    codes.push("FREE_CASH_FLOW");
    parts.push(fcf >= 0 ? 80 : 30);
  }
  if (!parts.length) return { score: null, codes };
  return { score: Math.round(parts.reduce((a, b) => a + b, 0) / parts.length), codes };
}

const SCORERS: Record<ScoreDimension, (m: MetricResult[]) => { score: number | null; codes: string[] }> = {
  profitability: scoreProfitability,
  liquidity: scoreLiquidity,
  leverage: scoreLeverage,
  efficiency: scoreEfficiency,
  cash_flow: scoreCashFlow,
};

export function computeScore(metrics: MetricResult[], quality: QualityAssessment): ScoreResult {
  const components: ScoreComponentResult[] = [];
  for (const dimension of Object.keys(WEIGHTS) as ScoreDimension[]) {
    const result = SCORERS[dimension](metrics);
    if (result.score == null) {
      components.push({
        dimension,
        weight: WEIGHTS[dimension],
        included: false,
        score: null,
        exclusionReason: "No eligible computed metrics for dimension",
        metricCodes: result.codes,
      });
    } else {
      components.push({
        dimension,
        weight: WEIGHTS[dimension],
        included: true,
        score: result.score,
        exclusionReason: null,
        metricCodes: result.codes,
      });
    }
  }

  const included = components.filter((c) => c.included && c.score != null);
  const coverageOk = d(quality.diagnosticCoverage).gte(SCORE_MIN_COVERAGE);
  const reliabilityOk = d(quality.evidenceReliability).gte(SCORE_MIN_RELIABILITY);
  const consistencyOk = d(quality.consistency).gte(SCORE_MIN_CONSISTENCY);
  const dimsOk = included.length >= SCORE_MIN_DIMENSIONS;

  const limitations = [
    "score.v1 thresholds are provisional heuristics, not industry benchmarks",
    "Missing dimensions are not renormalized to hide coverage gaps",
    "Unreviewed evidence lowers reliability and may suppress overall scoring",
    "Contradictory or multi-currency inputs lower consistency and may suppress overall scoring",
    "This score is not a credit rating, audit opinion, or prediction of business survival",
  ];

  if (!coverageOk || !reliabilityOk || !consistencyOk || !dimsOk) {
    return {
      status: "INSUFFICIENT_DATA",
      overallScore: null,
      methodologyVersion: SCORE_METHODOLOGY_VERSION,
      components,
      limitations: [
        ...limitations,
        !coverageOk ? `diagnosticCoverage < ${SCORE_MIN_COVERAGE}` : null,
        !reliabilityOk ? `evidenceReliability < ${SCORE_MIN_RELIABILITY}` : null,
        !consistencyOk ? `consistency < ${SCORE_MIN_CONSISTENCY}` : null,
        !dimsOk ? `included dimensions < ${SCORE_MIN_DIMENSIONS}` : null,
      ].filter(Boolean) as string[],
    };
  }

  // Weighted sum using original weights; excluded dimensions contribute 0 (no renormalization).
  const weighted = included.reduce((acc, c) => acc + (c.score as number) * c.weight, 0);
  const overallScore = Math.round(weighted / 100);

  return {
    status: "SCORED",
    overallScore,
    methodologyVersion: SCORE_METHODOLOGY_VERSION,
    components,
    limitations,
  };
}
