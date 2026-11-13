import { evaluateFindings } from "./findings.js";
import { computeMetrics } from "./kpi.js";
import { assessQuality } from "./quality.js";
import { computeScore } from "./score.js";
import type { DiagnosticEngineResult, DiagnosticSnapshot } from "./types.js";
import { CALC_ENGINE_VERSION, RULE_SET_VERSION, SCORE_METHODOLOGY_VERSION } from "./versions.js";

export function runDiagnosticEngine(snapshot: DiagnosticSnapshot): DiagnosticEngineResult {
  const metrics = computeMetrics(snapshot);
  const quality = assessQuality(snapshot, metrics);
  const score = computeScore(metrics, quality);
  const findings = evaluateFindings(snapshot, metrics, quality);
  return {
    calculationEngineVersion: CALC_ENGINE_VERSION,
    ruleSetVersion: RULE_SET_VERSION,
    scoreMethodologyVersion: SCORE_METHODOLOGY_VERSION,
    metrics,
    quality,
    score,
    findings,
  };
}
