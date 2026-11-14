import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";
import { checkFinancialConsistency } from "../consistency.js";
import { interpretExtractedLine } from "../interpret-line.js";
import { PARSER_LIMITS } from "../limits.js";
import { neutralizeFormulaLike } from "../money.js";
import {
  analyzeDuplicateMappedFigures,
  detectConsolidationScope,
  detectCurrencies,
  detectEntityName,
  detectPeriodLabel,
  detectUnitScale,
} from "../normalize-meta.js";
import type { ExtractionResult, ExtractedLine } from "../types.js";

function detectDelimiter(sample: string): string {
  const candidates = [",", ";", "\t", "|"] as const;
  let best = ",";
  let bestScore = -1;
  for (const delimiter of candidates) {
    const firstLines = sample.split(/\r?\n/).slice(0, 5);
    const counts = firstLines.map((line) => line.split(delimiter).length);
    const score = counts.reduce((a, b) => a + b, 0);
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

export function extractFromCsv(buffer: Buffer, documentId: string): ExtractionResult {
  const warnings: string[] = [];
  let text = buffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const delimiter = detectDelimiter(text.slice(0, 4096));
  const records = parse(text, {
    delimiter,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as string[][];

  if (records.length > PARSER_LIMITS.maxCsvRows) {
    throw new Error("CSV exceeds maximum row limit");
  }
  if ((records[0]?.length ?? 0) > PARSER_LIMITS.maxCsvColumns) {
    throw new Error("CSV exceeds maximum column limit");
  }

  const header = records[0] ?? [];
  const hasHeader =
    header.length >= 2 &&
    header.some((cell) => /label|account|description|item|line/i.test(cell)) &&
    header.some((cell) => /amount|value|balance|total/i.test(cell));

  const rows = hasHeader ? records.slice(1) : records;
  const labelIdx = hasHeader
    ? Math.max(
        0,
        header.findIndex((cell) => /label|account|description|item|line/i.test(cell)),
      )
    : 0;
  const valueIdx = hasHeader
    ? Math.max(
        1,
        header.findIndex((cell) => /amount|value|balance|total/i.test(cell)),
      )
    : 1;

  const preview = text.slice(0, 8000);
  const currencyMeta = detectCurrencies(preview);
  const scaleMeta = detectUnitScale(preview);
  const periodMeta = detectPeriodLabel(preview);
  const entityMeta = detectEntityName(preview);
  const consolidationMeta = detectConsolidationScope(preview);
  if (currencyMeta.warning) warnings.push(currencyMeta.warning);
  if (scaleMeta.warning) warnings.push(scaleMeta.warning);
  if (periodMeta.warning) warnings.push(periodMeta.warning);
  if (entityMeta.warning) warnings.push(entityMeta.warning);
  if (consolidationMeta.warning) warnings.push(consolidationMeta.warning);

  const currency = currencyMeta.currency;
  const lines: ExtractedLine[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (row.length === 0) continue;
    const labelRaw = neutralizeFormulaLike(String(row[labelIdx] ?? "").slice(0, PARSER_LIMITS.maxCellChars));
    const rawValue = neutralizeFormulaLike(String(row[valueIdx] ?? "").slice(0, PARSER_LIMITS.maxCellChars));
    if (!labelRaw) continue;
    if (!rawValue) {
      warnings.push(`Row ${i + 1}: missing amount for "${labelRaw}" (not treated as zero)`);
      continue;
    }

    const interpreted = interpretExtractedLine({
      labelRaw,
      rawValue,
      documentUnitScale: scaleMeta.unitScale,
      documentScaleConfidence: scaleMeta.confidence,
      documentScaleRequiresReview: scaleMeta.requiresReview,
    });
    warnings.push(...interpreted.warnings);

    if (!interpreted.normalizedValue && interpreted.quantityClass === "MONETARY") {
      continue;
    }
    if (!interpreted.normalizedValue) {
      // Keep non-monetary evidence that still parsed, or skip unparsable.
      continue;
    }

    const evidenceKey = createHash("sha256")
      .update(`${documentId}:csv:${i}:${labelIdx}:${valueIdx}:${interpreted.normalizedValue}`)
      .digest("hex")
      .slice(0, 32);

    lines.push({
      labelRaw: interpreted.labelRaw,
      rawValue: interpreted.rawValue,
      normalizedValue: interpreted.normalizedValue,
      concept: interpreted.concept,
      quantityClass: interpreted.quantityClass,
      currency,
      unitScale: interpreted.unitScale,
      scaleConfidence: interpreted.scaleConfidence,
      unitScaleRequiresReview: interpreted.unitScaleRequiresReview,
      quality: interpreted.quality,
      evidence: {
        evidenceKey,
        rowIndex: hasHeader ? i + 2 : i + 1,
        columnIndex: valueIdx + 1,
        snippet: `${labelRaw}=${rawValue}`.slice(0, 200),
      },
    });
  }

  if (lines.length === 0) {
    warnings.push("No financial amounts detected in CSV");
  }

  const duplicates = analyzeDuplicateMappedFigures(
    lines.map((l) => ({
      concept: l.concept,
      normalizedValue: l.normalizedValue,
      periodLabel: periodMeta.periodLabel,
      consolidationScope: consolidationMeta.consolidationScope,
      labelRaw: l.labelRaw,
    })),
  );
  warnings.push(...duplicates.warnings);

  const consistency = checkFinancialConsistency(
    lines.map((l) => ({
      concept: l.concept,
      normalizedValue: l.normalizedValue,
      unitScale: l.unitScale,
      quantityClass: l.quantityClass,
      currency: l.currency,
      periodLabel: periodMeta.periodLabel,
    })),
  );
  for (const finding of consistency) {
    if (finding.status === "INCONSISTENT" || finding.status === "REQUIRES_REVIEW") {
      warnings.push(`[${finding.code}] ${finding.message}`);
    }
  }

  const monetaryMapped = lines.some(
    (l) => l.quantityClass === "MONETARY" && l.concept !== "UNMAPPED",
  );
  const scaleBlocksReady = scaleMeta.requiresReview;

  return {
    method: "csv-parse",
    quality: monetaryMapped && !scaleBlocksReady ? "MEDIUM" : "LOW",
    warnings,
    manualRequired: !monetaryMapped || scaleBlocksReady,
    consistency,
    duplicates: duplicates.findings,
    statements: [
      {
        statementType: "UNKNOWN",
        currency,
        unitScale: scaleMeta.unitScale,
        scaleConfidence: scaleMeta.confidence,
        unitScaleRequiresReview: scaleMeta.requiresReview,
        periodStart: periodMeta.periodStart,
        periodEnd: periodMeta.periodEnd,
        periodLabel: periodMeta.periodLabel,
        entityName: entityMeta.entityName,
        consolidationScope: consolidationMeta.consolidationScope,
        lines,
      },
    ],
  };
}
