import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";
import { mapLabelToConcept } from "../concepts.js";
import { PARSER_LIMITS } from "../limits.js";
import { neutralizeFormulaLike, parseFinancialNumber } from "../money.js";
import {
  detectCurrencies,
  detectPeriodLabel,
  detectUnitScale,
  warnDuplicateNormalizedValues,
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

  const currencyMeta = detectCurrencies(text.slice(0, 4000));
  const scaleMeta = detectUnitScale(text.slice(0, 4000));
  const periodMeta = detectPeriodLabel(text.slice(0, 4000));
  if (currencyMeta.warning) warnings.push(currencyMeta.warning);
  if (scaleMeta.warning) warnings.push(scaleMeta.warning);
  if (periodMeta.warning) warnings.push(periodMeta.warning);

  const currency = currencyMeta.currency;
  const unitScale = scaleMeta.unitScale;
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
    const normalizedValue = parseFinancialNumber(rawValue);
    if (!normalizedValue) {
      warnings.push(`Row ${i + 1}: could not parse amount "${rawValue}"`);
      continue;
    }
    const concept = mapLabelToConcept(labelRaw);
    const evidenceKey = createHash("sha256")
      .update(`${documentId}:csv:${i}:${labelIdx}:${valueIdx}:${normalizedValue}`)
      .digest("hex")
      .slice(0, 32);

    lines.push({
      labelRaw,
      rawValue,
      normalizedValue,
      concept,
      currency,
      unitScale,
      quality: concept === "UNMAPPED" ? "LOW" : "MEDIUM",
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
  warnings.push(...warnDuplicateNormalizedValues(lines));

  return {
    method: "csv-parse",
    quality: lines.some((l) => l.concept !== "UNMAPPED") ? "MEDIUM" : "LOW",
    warnings,
    manualRequired: lines.every((l) => l.concept === "UNMAPPED"),
    statements: [
      {
        statementType: "UNKNOWN",
        currency,
        unitScale,
        periodStart: null,
        periodEnd: null,
        periodLabel: periodMeta.periodLabel,
        lines,
      },
    ],
  };
}
