import { buildSnapshot, type RawSnapshotLine } from "./snapshot.js";
import type { ReviewStatus, UnitScale } from "./types.js";

let seq = 0;

export function line(
  concept: string,
  value: string,
  overrides: Partial<RawSnapshotLine> = {},
): RawSnapshotLine {
  seq += 1;
  const id = String(seq).padStart(12, "0");
  return {
    lineItemId: overrides.lineItemId ?? `00000000-0000-4000-8000-${id}`,
    documentId: overrides.documentId ?? "00000000-0000-4000-8000-0000000000d1",
    extractionId: overrides.extractionId ?? "00000000-0000-4000-8000-0000000000e1",
    statementId: overrides.statementId ?? "00000000-0000-4000-8000-0000000000s1",
    concept,
    labelRaw: overrides.labelRaw ?? concept,
    rawValue: overrides.rawValue ?? value,
    normalizedValue: value,
    currency: overrides.currency ?? "USD",
    unitScale: (overrides.unitScale ?? "ACTUAL") as UnitScale,
    quality: overrides.quality ?? "HIGH",
    reviewStatus: (overrides.reviewStatus ?? "CONFIRMED") as ReviewStatus,
    statementType: overrides.statementType ?? "UNKNOWN",
    periodStart: "periodStart" in overrides ? (overrides.periodStart ?? null) : "2024-01-01",
    periodEnd: "periodEnd" in overrides ? (overrides.periodEnd ?? null) : "2024-12-31",
    periodLabel: "periodLabel" in overrides ? (overrides.periodLabel ?? null) : "FY2024",
    evidenceReferenceId: overrides.evidenceReferenceId ?? null,
    evidenceKey: overrides.evidenceKey ?? null,
  };
}

export function healthySnapshot() {
  seq = 0;
  return buildSnapshot({
    currency: "USD",
    periodStart: "2024-01-01",
    periodEnd: "2024-12-31",
    periodLabel: "FY2024",
    lines: [
      line("REVENUE", "1000", {
        periodLabel: "FY2023",
        periodStart: "2023-01-01",
        periodEnd: "2023-12-31",
      }),
      line("REVENUE", "1200"),
      line("COST_OF_GOODS_SOLD", "480"),
      line("GROSS_PROFIT", "720"),
      line("OPERATING_EXPENSES", "300"),
      line("OPERATING_PROFIT", "420"),
      line("NET_PROFIT", "300"),
      line("CASH_AND_EQUIVALENTS", "200"),
      line("ACCOUNTS_RECEIVABLE", "100"),
      line("ACCOUNTS_PAYABLE", "80"),
      line("INVENTORY", "120"),
      line("CURRENT_ASSETS", "500"),
      line("CURRENT_LIABILITIES", "250"),
      line("TOTAL_ASSETS", "1000"),
      line("TOTAL_LIABILITIES", "400"),
      line("EQUITY", "600"),
      line("INTEREST_BEARING_DEBT", "200"),
      line("INTEREST_EXPENSE", "40"),
      line("OPERATING_CASH_FLOW", "350"),
      line("CAPITAL_EXPENDITURE", "50"),
    ],
  });
}

export function distressedSnapshot() {
  seq = 0;
  return buildSnapshot({
    currency: "USD",
    periodStart: "2024-01-01",
    periodEnd: "2024-12-31",
    periodLabel: "FY2024",
    lines: [
      line("REVENUE", "800", {
        periodLabel: "FY2023",
        periodStart: "2023-01-01",
        periodEnd: "2023-12-31",
      }),
      line("NET_PROFIT", "-50", {
        periodLabel: "FY2023",
        periodStart: "2023-01-01",
        periodEnd: "2023-12-31",
      }),
      line("REVENUE", "900"),
      line("NET_PROFIT", "-80"),
      line("OPERATING_CASH_FLOW", "-120"),
      line("CURRENT_ASSETS", "100"),
      line("CURRENT_LIABILITIES", "250"),
      line("TOTAL_ASSETS", "400"),
      line("TOTAL_LIABILITIES", "350"),
      line("EQUITY", "50"),
    ],
  });
}

export function incompleteSnapshot() {
  seq = 0;
  return buildSnapshot({
    currency: "USD",
    lines: [line("REVENUE", "100", { reviewStatus: "PENDING", quality: "LOW" })],
  });
}
