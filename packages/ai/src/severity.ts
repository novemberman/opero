import type { AiNarrative } from "./schema.js";
import type {
  GroundingCheckResult,
  NarrativeSection,
  UnsupportedClaim,
} from "./types.js";

/** Version recorded on approved/published report versions. */
export const GROUNDING_VALIDATION_VERSION = "grounding.v2";

export type GroundingViolationSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type ClassifiedGroundingViolation = UnsupportedClaim & {
  severity: GroundingViolationSeverity;
};

export type GroundingValidationResult = {
  version: typeof GROUNDING_VALIDATION_VERSION;
  groundedClaims: GroundingCheckResult["groundedClaims"];
  unsupportedClaims: ClassifiedGroundingViolation[];
  criticalViolations: ClassifiedGroundingViolation[];
  highViolations: ClassifiedGroundingViolation[];
  passed: boolean;
};

const NUMBER_PATTERN = /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/;

function hasNumber(text: string): boolean {
  return NUMBER_PATTERN.test(text);
}

/**
 * Classifies grounding flags for publication gating.
 *
 * CRITICAL (hard-blocks approve/publish; human approval cannot override):
 * - UNSUPPORTED_NUMBER / CONTRADICTORY_NUMBER
 * - RESTRICTED_LANGUAGE (audit / credit-rating / insolvency assurance wording)
 * - Numeric material conclusions with NO_REFERENCES or unknown refs
 *   (outside the limitations section)
 *
 * Limitations/uncertainty prose without invented numbers remains allowed
 * (NO_REFERENCES in limitations without figures → LOW).
 */
export function severityForUnsupportedClaim(
  claim: UnsupportedClaim,
): GroundingViolationSeverity {
  const reasons = new Set(claim.reasons);
  const section: NarrativeSection | "claims" = claim.section ?? "claims";
  const numeric = hasNumber(claim.text) || (claim.unsupportedNumbers?.length ?? 0) > 0;

  if (reasons.has("UNSUPPORTED_NUMBER") || reasons.has("CONTRADICTORY_NUMBER")) {
    return "CRITICAL";
  }
  if (reasons.has("RESTRICTED_LANGUAGE")) {
    return "CRITICAL";
  }
  if (
    numeric &&
    (reasons.has("NO_REFERENCES") ||
      reasons.has("UNKNOWN_METRIC_CODE") ||
      reasons.has("UNKNOWN_FINDING_ID"))
  ) {
    // Material financial conclusion with a figure but no valid evidence.
    if (section === "limitations") {
      // Labeled limitations may discuss uncertainty; still block invented figures
      // via UNSUPPORTED_NUMBER above. Missing refs without unsupported figures → HIGH.
      return "HIGH";
    }
    return "CRITICAL";
  }
  if (reasons.has("UNKNOWN_METRIC_CODE") || reasons.has("UNKNOWN_FINDING_ID")) {
    return "HIGH";
  }
  if (reasons.has("NO_REFERENCES")) {
    return section === "limitations" ? "LOW" : "MEDIUM";
  }
  return "MEDIUM";
}

export function classifyGroundingResult(
  result: GroundingCheckResult,
): GroundingValidationResult {
  const unsupportedClaims = result.unsupportedClaims.map((claim) => ({
    ...claim,
    severity: severityForUnsupportedClaim(claim),
  }));
  const criticalViolations = unsupportedClaims.filter((c) => c.severity === "CRITICAL");
  const highViolations = unsupportedClaims.filter((c) => c.severity === "HIGH");
  return {
    version: GROUNDING_VALIDATION_VERSION,
    groundedClaims: result.groundedClaims,
    unsupportedClaims,
    criticalViolations,
    highViolations,
    passed: criticalViolations.length === 0,
  };
}

/** True when the narrative may be approved/published with an AI section. */
export function groundingAllowsPublication(result: GroundingValidationResult): boolean {
  return result.passed;
}

/** Minimal narrative shape used when re-validating a frozen report payload. */
export type ValidatableNarrative = Pick<
  AiNarrative,
  "summary" | "keyObservations" | "risks" | "limitations" | "claims"
>;
