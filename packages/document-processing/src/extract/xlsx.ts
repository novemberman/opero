import ExcelJS from "exceljs";
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
  // exceljs load accepts Buffer
  await workbook.xlsx.load(buffer as never);

  if (workbook.worksheets.length > PARSER_LIMITS.maxXlsxSheets) {
    throw new Error("Workbook exceeds maximum worksheet limit");
  }

  const lines: ExtractedLine[] = [];
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
      // exceljs is 1-indexed
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
      const normalizedValue = parseFinancialNumber(rawValue);
      if (!normalizedValue) {
        warnings.push(`Sheet ${sheet.name} ${cellRef(rowNumber, 2)}: could not parse amount "${rawValue}"`);
        return;
      }
      const concept = mapLabelToConcept(labelRaw);
      const ref = cellRef(rowNumber, 2);
      const evidenceKey = createHash("sha256")
        .update(`${documentId}:xlsx:${sheet.name}:${ref}:${normalizedValue}`)
        .digest("hex")
        .slice(0, 32);
      lines.push({
        labelRaw,
        rawValue,
        normalizedValue,
        concept,
        currency: null,
        unitScale: "ACTUAL",
        quality: concept === "UNMAPPED" ? "LOW" : "HIGH",
        evidence: {
          evidenceKey,
          sheetName: sheet.name,
          cellRef: ref,
          rowIndex: rowNumber,
          columnIndex: 2,
          snippet: `${labelRaw}=${rawValue}`.slice(0, 200),
        },
      });
    });
  }

  const preview = previewParts.join("\n").slice(0, 4000);
  const currencyMeta = detectCurrencies(preview);
  const scaleMeta = detectUnitScale(preview);
  const periodMeta = detectPeriodLabel(preview);
  if (currencyMeta.warning) warnings.push(currencyMeta.warning);
  if (scaleMeta.warning) warnings.push(scaleMeta.warning);
  if (periodMeta.warning) warnings.push(periodMeta.warning);
  for (const line of lines) {
    line.currency = currencyMeta.currency;
    line.unitScale = scaleMeta.unitScale;
  }

  if (lines.length === 0) {
    warnings.push("No financial amounts detected in workbook (expected label in column A, amount in column B)");
  }
  warnings.push(...warnDuplicateNormalizedValues(lines));

  return {
    method: "exceljs-cached-values",
    quality: lines.some((l) => l.concept !== "UNMAPPED") ? "HIGH" : "LOW",
    warnings,
    manualRequired: lines.length === 0,
    statements: [
      {
        statementType: "UNKNOWN",
        currency: currencyMeta.currency,
        unitScale: scaleMeta.unitScale,
        periodStart: null,
        periodEnd: null,
        periodLabel: periodMeta.periodLabel,
        lines,
      },
    ],
  };
}
