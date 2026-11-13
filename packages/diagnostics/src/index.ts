export { buildSnapshot, type RawSnapshotLine } from "./snapshot.js";
export { runDiagnosticEngine } from "./engine.js";
export { computeMetrics } from "./kpi.js";
export { assessQuality } from "./quality.js";
export { computeScore } from "./score.js";
export { evaluateFindings } from "./findings.js";
export { RULES_V1, type RuleCatalogEntry } from "./rules-catalog.js";
export {
  CALC_ENGINE_VERSION,
  RULE_SET_ID,
  RULE_SET_VERSION,
  SCORE_METHODOLOGY_VERSION,
  SCORE_MIN_CONSISTENCY,
  SCORE_MIN_COVERAGE,
  SCORE_MIN_DIMENSIONS,
  SCORE_MIN_RELIABILITY,
} from "./versions.js";
export { assessReadiness } from "./readiness/assess.js";
export type {
  ReadinessChecklistItem,
  ReadinessInput,
  ReadinessInputDocument,
  ReadinessIssue,
  ReadinessIssueSeverity,
  ReadinessResult,
  ReadinessStatus,
} from "./readiness/types.js";
export {
  detectEvidenceConflicts,
  hasUnresolvedCriticalConflicts,
} from "./reconciliation/detect.js";
export type {
  ConflictCandidate,
  EvidenceConflict,
  ReconciliationResolutionInput,
  ReconciliationSeverity,
} from "./reconciliation/types.js";
export type {
  DiagnosticEngineResult,
  DiagnosticSnapshot,
  FindingDraft,
  MetricResult,
  QualityAssessment,
  ScoreResult,
  SnapshotLineItem,
} from "./types.js";
