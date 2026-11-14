import ExcelJS from "exceljs";
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

function cellRef(row: number, col: number): string {
  let n = col;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return `${letters}${row}`;
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object" && "result" in value) {
    // Formula: use cached result only; never execute.
    return cellToString(value.result as ExcelJS.CellValue);
  }
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text;
  }
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }
  return "";
}

export async function extractFromXlsx(buffer: Buffer, documentId: string): Promise<ExtractionResult> {
  const warnings: string[] = [];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);

  if (workbook.worksheets.length > PARSER_LIMITS.maxXlsxSheets) {
    throw new Error("Workbook exceeds maximum worksheet limit");
  }

  const rawRows: Array<{
    labelRaw: string;
    rawValue: string;
    sheetName: string;
    rowNumber: number;
  }> = [];
  let cellsSeen = 0;
  const previewParts: string[] = [];

  for (const sheet of workbook.worksheets) {
    let rowCount = 0;
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      rowCount += 1;
      if (rowCount > PARSER_LIMITS.maxXlsxRowsPerSheet) {
        throw new Error(`Sheet ${sheet.name} exceeds maximum row limit`);
      }
      const values = Array.isArray(row.values) ? row.values : [];
      const labelRaw = neutralizeFormulaLike(
        cellToString(values[1] as ExcelJS.CellValue).slice(0, PARSER_LIMITS.maxCellChars),
      );
      const rawValue = neutralizeFormulaLike(
        cellToString(values[2] as ExcelJS.CellValue).slice(0, PARSER_LIMITS.maxCellChars),
      );
      cellsSeen += 2;
      if (cellsSeen > PARSER_LIMITS.maxXlsxCells) {
        throw new Error("Workbook exceeds maximum cell limit");
      }
      if (labelRaw || rawValue) {
        previewParts.push(`${labelRaw} ${rawValue}`);
      }
      if (!labelRaw || !rawValue) {
        return;
      }
      rawRows.push({ labelRaw, rawValue, sheetName: sheet.name, rowNumber });
    });
  }

  const preview = previewParts.join("\n").slice(0, 8000);
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

  const lines: ExtractedLine[] = [];
  for (const row of rawRows) {
    const interpreted = interpretExtractedLine({
      labelRaw: row.labelRaw,
      rawValue: row.rawValue,
      documentUnitScale: scaleMeta.unitScale,
      documentScaleConfidence: scaleMeta.confidence,
      documentScaleRequiresReview: scaleMeta.requiresReview,
    });
    warnings.push(...interpreted.warnings);
    if (!interpreted.normalizedValue) {
      if (interpreted.quantityClass === "MONETARY") {
        warnings.push(
          `Sheet ${row.sheetName} ${cellRef(row.rowNumber, 2)}: could not parse amount "${row.rawValue}"`,
        );
      }
      continue;
    }
    const ref = cellRef(row.rowNumber, 2);
    const evidenceKey = createHash("sha256")
      .update(`${documentId}:xlsx:${row.sheetName}:${ref}:${interpreted.normalizedValue}`)
      .digest("hex")
      .slice(0, 32);
    lines.push({
      labelRaw: interpreted.labelRaw,
      rawValue: interpreted.rawValue,
      normalizedValue: interpreted.normalizedValue,
      concept: interpreted.concept,
      quantityClass: interpreted.quantityClass,
      currency: currencyMeta.currency,
      unitScale: interpreted.unitScale,
      scaleConfidence: interpreted.scaleConfidence,
      unitScaleRequiresReview: interpreted.unitScaleRequiresReview,
      quality: interpreted.quality,
      evidence: {
        evidenceKey,
        sheetName: row.sheetName,
        cellRef: ref,
        rowIndex: row.rowNumber,
        columnIndex: 2,
        snippet: `${row.labelRaw}=${row.rawValue}`.slice(0, 200),
      },
    });
  }

  if (lines.length === 0) {
    warnings.push(
      "No financial amounts detected in workbook (expected label in column A, amount in column B)",
    );
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

  const monetaryMapped = lines.some(
    (l) => l.quantityClass === "MONETARY" && l.concept !== "UNMAPPED",
  );

  return {
    method: "exceljs-cached-values",
    quality: monetaryMapped && !scaleMeta.requiresReview ? "HIGH" : "LOW",
    warnings,
    manualRequired: lines.length === 0 || scaleMeta.requiresReview,
    consistency,
    duplicates: duplicates.findings,
    statements: [
      {
        statementType: "UNKNOWN",
        currency: currencyMeta.currency,
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
