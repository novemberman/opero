import type { FinancialConceptId } from "./concepts.js";
import type { ScaleConfidenceId, UnitScaleId } from "./normalize-meta.js";
import type { QuantityClassId } from "./quantity-class.js";
import type { ConsistencyFinding } from "./consistency.js";
import type { DuplicateFinding } from "./normalize-meta.js";

export type EvidenceLocator = {
  evidenceKey: string;
  pageNumber?: number;
  sheetName?: string;
  cellRef?: string;
  rowIndex?: number;
  columnIndex?: number;
  snippet?: string;
};

export type ExtractedLine = {
  labelRaw: string;
  rawValue: string;
  /** Parsed numeric value in statement units (no scale multiplier applied). */
  normalizedValue: string | null;
  concept: FinancialConceptId;
  quantityClass: QuantityClassId;
  currency: string | null;
  unitScale: UnitScaleId;
  scaleConfidence: ScaleConfidenceId;
  unitScaleRequiresReview: boolean;
  quality: "HIGH" | "MEDIUM" | "LOW" | "MANUAL";
  evidence: EvidenceLocator;
};

export type ExtractedStatement = {
  statementType: "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW" | "UNKNOWN";
  currency: string | null;
  unitScale: UnitScaleId;
  scaleConfidence: ScaleConfidenceId;
  unitScaleRequiresReview: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  periodLabel: string | null;
  entityName: string | null;
  consolidationScope: "CONSOLIDATED" | "ENTITY" | "UNKNOWN";
  lines: ExtractedLine[];
};

export type ExtractionResult = {
  method: string;
  quality: "HIGH" | "MEDIUM" | "LOW" | "MANUAL";
  warnings: string[];
  statements: ExtractedStatement[];
  manualRequired: boolean;
  consistency: ConsistencyFinding[];
  duplicates: DuplicateFinding[];
};
