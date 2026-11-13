import { createHash } from "node:crypto";
import { d, scaleFactor, toPlain } from "./decimal.js";
import type { DiagnosticSnapshot, SnapshotLineItem, UnitScale } from "./types.js";

export type RawSnapshotLine = {
  lineItemId: string;
  documentId: string;
  extractionId: string;
  statementId: string;
  concept: string;
  labelRaw: string;
  rawValue: string;
  normalizedValue: string | null;
  currency: string | null;
  unitScale: UnitScale;
  quality: SnapshotLineItem["quality"];
  reviewStatus: SnapshotLineItem["reviewStatus"];
  statementType: string;
  periodStart: string | null;
  periodEnd: string | null;
  periodLabel: string | null;
  evidenceReferenceId: string | null;
  evidenceKey: string | null;
};

function normalizeActual(
  normalizedValue: string | null,
  unitScale: UnitScale,
): { actualValue: string | null; warning?: string } {
  if (normalizedValue == null) return { actualValue: null };
  const factor = scaleFactor(unitScale);
  if (!factor) return { actualValue: null, warning: `Unknown unit scale ${unitScale}` };
  try {
    return { actualValue: toPlain(d(normalizedValue).mul(factor)) };
  } catch {
    return { actualValue: null, warning: `Invalid numeric value for scale normalization` };
  }
}

export function buildSnapshot(input: {
  lines: RawSnapshotLine[];
  currency?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  periodLabel?: string | null;
}): DiagnosticSnapshot {
  const warnings: string[] = [];
  const lines: SnapshotLineItem[] = input.lines
    .filter((line) => line.reviewStatus !== "REJECTED" && line.concept !== "UNMAPPED")
    .map((line) => {
      const scaled = normalizeActual(line.normalizedValue, line.unitScale);
      if (scaled.warning) warnings.push(scaled.warning);
      const snapshotKey = [
        line.documentId,
        line.extractionId,
        line.lineItemId,
        line.concept,
        line.normalizedValue ?? "null",
        line.reviewStatus,
      ].join(":");
      return {
        snapshotKey,
        lineItemId: line.lineItemId,
        documentId: line.documentId,
        extractionId: line.extractionId,
        statementId: line.statementId,
        concept: line.concept,
        labelRaw: line.labelRaw,
        rawValue: line.rawValue,
        normalizedValue: line.normalizedValue,
        actualValue: scaled.actualValue,
        currency: line.currency,
        unitScale: line.unitScale,
        quality: line.quality,
        reviewStatus: line.reviewStatus,
        statementType: line.statementType,
        periodStart: line.periodStart,
        periodEnd: line.periodEnd,
        periodLabel: line.periodLabel,
        evidenceReferenceId: line.evidenceReferenceId,
        evidenceKey: line.evidenceKey,
      };
    });

  const currencies = new Set(
    lines.map((l) => l.currency).filter((c): c is string => Boolean(c)),
  );
  let currency = input.currency ?? null;
  if (!currency && currencies.size === 1) {
    currency = [...currencies][0] ?? null;
  }
  if (currencies.size > 1 && input.currency) {
    const foreign = [...currencies].filter((c) => c !== input.currency);
    if (foreign.length) {
      warnings.push(`Currency mismatch vs requested ${input.currency}: ${foreign.join(",")}`);
    }
  } else if (currencies.size > 1) {
    warnings.push(`Multiple currencies in inputs: ${[...currencies].join(",")}`);
    currency = null;
  }

  const documentIds = [...new Set(lines.map((l) => l.documentId))];
  const extractionIds = [...new Set(lines.map((l) => l.extractionId))];

  const canonical = JSON.stringify({
    currency,
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    periodLabel: input.periodLabel ?? null,
    lines: lines.map((l) => ({
      snapshotKey: l.snapshotKey,
      concept: l.concept,
      actualValue: l.actualValue,
      currency: l.currency,
      unitScale: l.unitScale,
      reviewStatus: l.reviewStatus,
      periodStart: l.periodStart,
      periodEnd: l.periodEnd,
      periodLabel: l.periodLabel,
    })),
  });
  const contentHash = createHash("sha256").update(canonical).digest("hex");

  return {
    contentHash,
    currency,
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    periodLabel: input.periodLabel ?? null,
    documentIds,
    extractionIds,
    lines,
    warnings,
  };
}
