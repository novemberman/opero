import { scaleFactor } from "./decimal.js";
import type { ReviewStatus, UnitScale } from "./types.js";

/**
 * P0-A financial eligibility contract for authoritative diagnostic monetary inputs.
 *
 * A line is eligible only when ALL of the following hold:
 * 1. Supported mapped monetary concept (not UNMAPPED / empty).
 * 2. quantityClass MONETARY (missing class treated as MONETARY for pre-Phase-8 rows).
 * 3. reviewStatus === CONFIRMED
 *    — CORRECTED alone is NOT approval (legacy / intermediate).
 *    — The CORRECT API action must set CONFIRMED so correction remains an explicit approval.
 * 4. Unit scale is resolved and valid (ACTUAL | THOUSANDS | MILLIONS).
 * 5. unitScaleRequiresReview is not set.
 * 6. Organization / statement / period scoping is enforced by callers when loading lines.
 *
 * Non-monetary, UNMAPPED, REJECTED, PENDING, and CORRECTED lines never contribute
 * actualValue to diagnostics, KPIs, BHS, AI, or published conclusions.
 */
export type EligibilityLine = {
  concept: string;
  quantityClass?: string | null;
  reviewStatus: ReviewStatus | string;
  unitScale?: string | null;
  unitScaleRequiresReview?: boolean | null;
  normalizedValue?: string | null;
  labelRaw?: string | null;
};

export type EligibilityDecision = {
  eligible: boolean;
  reason?:
    | "UNMAPPED"
    | "NON_MONETARY"
    | "REJECTED"
    | "UNCONFIRMED_REVIEW"
    | "SCALE_REQUIRES_REVIEW"
    | "INVALID_SCALE"
    | "MISSING_VALUE";
};

export function quantityClassOf(line: Pick<EligibilityLine, "quantityClass">): string {
  return line.quantityClass ?? "MONETARY";
}

export function isMappedMonetaryConcept(concept: string): boolean {
  return Boolean(concept) && concept !== "UNMAPPED";
}

export function isHumanConfirmedReview(status: string): boolean {
  return status === "CONFIRMED";
}

export function evaluateMonetaryEligibility(line: EligibilityLine): EligibilityDecision {
  if (!isMappedMonetaryConcept(line.concept)) {
    return { eligible: false, reason: "UNMAPPED" };
  }
  if (quantityClassOf(line) !== "MONETARY") {
    return { eligible: false, reason: "NON_MONETARY" };
  }
  if (line.reviewStatus === "REJECTED") {
    return { eligible: false, reason: "REJECTED" };
  }
  if (!isHumanConfirmedReview(line.reviewStatus)) {
    return { eligible: false, reason: "UNCONFIRMED_REVIEW" };
  }
  if (line.unitScaleRequiresReview) {
    return { eligible: false, reason: "SCALE_REQUIRES_REVIEW" };
  }
  const scale = (line.unitScale ?? "ACTUAL") as UnitScale;
  if (!scaleFactor(scale)) {
    return { eligible: false, reason: "INVALID_SCALE" };
  }
  if (line.normalizedValue == null) {
    return { eligible: false, reason: "MISSING_VALUE" };
  }
  return { eligible: true };
}

/** Material financial figures that must be confirmed before READY / authoritative conclusions. */
export function isMaterialMonetaryReviewItem(line: EligibilityLine): boolean {
  if (!isMappedMonetaryConcept(line.concept)) return false;
  if (quantityClassOf(line) !== "MONETARY") return false;
  if (line.reviewStatus === "REJECTED") return false;
  return true;
}

/** True when a material monetary line still blocks authoritative readiness. */
export function materialMonetaryNeedsConfirmation(line: EligibilityLine): boolean {
  if (!isMaterialMonetaryReviewItem(line)) return false;
  if (!isHumanConfirmedReview(line.reviewStatus)) return true;
  if (line.unitScaleRequiresReview) return true;
  const scale = (line.unitScale ?? "ACTUAL") as UnitScale;
  if (!scaleFactor(scale)) return true;
  return false;
}

export function eligibilityExclusionWarning(line: EligibilityLine, decision: EligibilityDecision): string | null {
  if (decision.eligible) return null;
  const label = line.labelRaw ?? line.concept;
  switch (decision.reason) {
    case "UNCONFIRMED_REVIEW":
      return `Unconfirmed monetary line ${label} (${line.reviewStatus}); absolute value withheld from diagnostics`;
    case "SCALE_REQUIRES_REVIEW":
      return `Unconfirmed monetary scale for ${label}; absolute value withheld`;
    case "INVALID_SCALE":
      return `Unknown unit scale ${line.unitScale} for ${label}`;
    case "MISSING_VALUE":
      return `Missing normalized value for ${label}`;
    case "NON_MONETARY":
      return `Excluded non-monetary line ${label} (${quantityClassOf(line)}) from diagnostic snapshot`;
    case "REJECTED":
    case "UNMAPPED":
    default:
      return null;
  }
}
