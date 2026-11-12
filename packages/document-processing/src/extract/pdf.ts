import { createHash } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
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

type TextItem = { str?: string };

export async function extractFromPdf(buffer: Buffer, documentId: string): Promise<ExtractionResult> {
  const warnings: string[] = [];
  const data = new Uint8Array(buffer);
  const loadingTask = getDocument({
    data,
    // Disable workers / remote fonts for deterministic local parsing.
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;

  if (pdf.numPages > PARSER_LIMITS.maxPdfPages) {
    throw new Error("PDF exceeds maximum page limit");
  }

  let totalChars = 0;
  const lines: ExtractedLine[] = [];
  let textPages = 0;
  const allText: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = (content.items as TextItem[])
      .map((item) => item.str ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    totalChars += pageText.length;
    if (totalChars > PARSER_LIMITS.maxPdfTextChars) {
      throw new Error("PDF text exceeds maximum character limit");
    }
    if (pageText.length > 0) {
      textPages += 1;
      allText.push(pageText);
    }

    // Heuristic: "Label 1,234.56" pairs on a page.
    const matches = pageText.matchAll(/([A-Za-z][A-Za-z0-9 &'%/.-]{2,80})\s+(-?\$?\(?[\d,]+(?:\.\d+)?\)?)/g);
    for (const match of matches) {
      const labelRaw = neutralizeFormulaLike((match[1] ?? "").trim());
      const rawValue = neutralizeFormulaLike((match[2] ?? "").trim());
      const normalizedValue = parseFinancialNumber(rawValue);
      if (!normalizedValue) continue;
      const concept = mapLabelToConcept(labelRaw);
      const evidenceKey = createHash("sha256")
        .update(`${documentId}:pdf:${pageNumber}:${labelRaw}:${normalizedValue}`)
        .digest("hex")
        .slice(0, 32);
      lines.push({
        labelRaw,
        rawValue,
        normalizedValue,
        concept,
        currency: null,
        unitScale: "ACTUAL",
        quality: concept === "UNMAPPED" ? "LOW" : "MEDIUM",
        evidence: {
          evidenceKey,
          pageNumber,
          snippet: `${labelRaw} ${rawValue}`.slice(0, 200),
        },
      });
    }
  }

  const preview = allText.join("\n").slice(0, 8000);
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

  const manualRequired = textPages === 0;
  if (manualRequired) {
    warnings.push("No extractable text found; OCR is not implemented — manual review required");
  } else if (lines.length === 0) {
    warnings.push("Text extracted but no financial figures matched heuristics");
  }
  warnings.push(...warnDuplicateNormalizedValues(lines));

  return {
    method: "pdfjs-text",
    quality: manualRequired ? "MANUAL" : lines.some((l) => l.concept !== "UNMAPPED") ? "MEDIUM" : "LOW",
    warnings,
    manualRequired,
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
