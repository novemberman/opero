import DecimalDefault from "decimal.js";
import { isKnownUnmappedDistinction, mapLabelToConcept, type FinancialConceptId } from "./concepts.js";
import { parseFinancialNumber } from "./money.js";
import type { ScaleConfidenceId, UnitScaleId } from "./normalize-meta.js";
import {
  classifyQuantity,
  isMonetaryQuantity,
  type QuantityClassId,
} from "./quantity-class.js";

type DecimalConstructor = {
  new (value: string | number): { mul: (f: string | number) => { toFixed: () => string } };
};
const Decimal = DecimalDefault as unknown as DecimalConstructor;

/**
 * Monetary value contract (do not double-scale):
 *
 * - `rawValue`: original source text (preserved for evidence).
 * - `normalizedValue`: numeric parse of `rawValue` in **statement units**
 *   (e.g. 144000 when the statement is in NGN thousands). Never includes the
 *   unit-scale multiplier.
 * - Scaled absolute amount (e.g. NGN 144,000,000) = `applyUnitScale(normalizedValue, unitScale)`.
 *   Diagnostics call this `actualValue`; the API exposes it as `actualMonetaryValue`.
 * - Non-monetary quantity classes always use unitScale ACTUAL so multipliers are never applied.
 */
export type InterpretedLine = {
  labelRaw: string;
  rawValue: string;
  /** Numeric parse of rawValue in statement units (no scale multiplier). Never overwrites rawValue. */
  normalizedValue: string | null;
  concept: FinancialConceptId;
  quantityClass: QuantityClassId;
  unitScale: UnitScaleId;
  scaleConfidence: ScaleConfidenceId;
  unitScaleRequiresReview: boolean;
  quality: "HIGH" | "MEDIUM" | "LOW" | "MANUAL";
  warnings: string[];
};

/**
 * Shared interpretation for CSV/XLSX/PDF cells.
 * Applies quantity classification before concept mapping and never scales the raw number here.
 */
export function interpretExtractedLine(input: {
  labelRaw: string;
  rawValue: string;
  documentUnitScale: UnitScaleId;
  documentScaleConfidence: ScaleConfidenceId;
  documentScaleRequiresReview: boolean;
}): InterpretedLine {
  const warnings: string[] = [];
  const quantity = classifyQuantity({ label: input.labelRaw, rawValue: input.rawValue });
  const normalizedValue = parseFinancialNumber(input.rawValue.replace(/%\s*$/, ""));

  let concept: FinancialConceptId = "UNMAPPED";
  if (isMonetaryQuantity(quantity.quantityClass)) {
    concept = mapLabelToConcept(input.labelRaw);
  } else {
    warnings.push(
      `"${input.labelRaw}" classified as ${quantity.quantityClass} (${quantity.reason}); not mapped as a monetary concept`,
    );
  }

  if (concept === "UNMAPPED" && isKnownUnmappedDistinction(input.labelRaw)) {
    warnings.push(
      `"${input.labelRaw}" recognized as a distinct accounting line without a diagnostic concept mapping`,
    );
  }

  // Do not apply document monetary scale to non-monetary quantities.
  const unitScale = isMonetaryQuantity(quantity.quantityClass)
    ? input.documentUnitScale
    : "ACTUAL";
  const scaleConfidence = isMonetaryQuantity(quantity.quantityClass)
    ? input.documentScaleConfidence
    : "HIGH";
  const unitScaleRequiresReview =
    isMonetaryQuantity(quantity.quantityClass) && input.documentScaleRequiresReview;

  let quality: InterpretedLine["quality"] = "MEDIUM";
  if (!isMonetaryQuantity(quantity.quantityClass)) quality = "LOW";
  else if (concept === "UNMAPPED") quality = "LOW";
  else if (
    unitScaleRequiresReview ||
    scaleConfidence === "AMBIGUOUS" ||
    scaleConfidence === "UNKNOWN"
  ) {
    quality = "LOW";
  } else if (scaleConfidence === "HIGH") {
    quality = "HIGH";
  }

  if (!normalizedValue && isMonetaryQuantity(quantity.quantityClass)) {
    warnings.push(`Could not parse amount "${input.rawValue}"`);
  }

  return {
    labelRaw: input.labelRaw,
    rawValue: input.rawValue,
    normalizedValue,
    concept,
    quantityClass: quantity.quantityClass,
    unitScale,
    scaleConfidence,
    unitScaleRequiresReview,
    quality,
    warnings,
  };
}

/**
 * Apply unit scale to a statement-unit `normalizedValue`.
 * Call only for MONETARY quantities — percentages/ratios/dates must stay unscaled.
 */
export function applyUnitScale(
  normalizedValue: string | null,
  unitScale: UnitScaleId,
): string | null {
  if (normalizedValue == null) return null;
  const factor = unitScale === "THOUSANDS" ? "1000" : unitScale === "MILLIONS" ? "1000000" : "1";
  try {
    return new Decimal(normalizedValue).mul(factor).toFixed();
  } catch {
    return null;
  }
}

/**
 * Resolve the absolute monetary amount for display / diagnostics.
 * Returns null for non-monetary quantities so multipliers are never applied.
 */
export function resolveActualMonetaryValue(input: {
  normalizedValue: string | null;
  unitScale: UnitScaleId;
  quantityClass: QuantityClassId | string | null | undefined;
}): string | null {
  const quantityClass = input.quantityClass ?? "MONETARY";
  if (quantityClass !== "MONETARY") return null;
  return applyUnitScale(input.normalizedValue, input.unitScale);
}
