import type { FinancialConceptId } from "./concepts.js";

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
  normalizedValue: string | null;
  concept: FinancialConceptId;
  currency: string | null;
  unitScale: "ACTUAL" | "THOUSANDS" | "MILLIONS";
  quality: "HIGH" | "MEDIUM" | "LOW" | "MANUAL";
  evidence: EvidenceLocator;
};

export type ExtractedStatement = {
  statementType: "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW" | "UNKNOWN";
  currency: string | null;
  unitScale: "ACTUAL" | "THOUSANDS" | "MILLIONS";
  periodStart: string | null;
  periodEnd: string | null;
  periodLabel: string | null;
  lines: ExtractedLine[];
};

export type ExtractionResult = {
  method: string;
  quality: "HIGH" | "MEDIUM" | "LOW" | "MANUAL";
  warnings: string[];
  statements: ExtractedStatement[];
  manualRequired: boolean;
};
