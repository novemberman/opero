export const CALC_ENGINE_VERSION = "calc.v1";
export const SCORE_METHODOLOGY_VERSION = "score.v1";
export const RULE_SET_VERSION = "rules.v1";
export const RULE_SET_ID = "opero.xray";

/** Minimum diagnostic coverage (0–1) to publish an overall numeric score. */
export const SCORE_MIN_COVERAGE = "0.60";
/** Minimum evidence reliability (0–1) to publish an overall numeric score. */
export const SCORE_MIN_RELIABILITY = "0.50";
/** Minimum consistency (0–1); contradictory/unresolved evidence cannot publish a score. */
export const SCORE_MIN_CONSISTENCY = "0.70";
/** Minimum included score dimensions (of 5). */
export const SCORE_MIN_DIMENSIONS = 3;
