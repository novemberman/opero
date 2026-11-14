import { createHash } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
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

type TextItem = { str?: string };

export async function extractFromPdf(buffer: Buffer, documentId: string): Promise<ExtractionResult> {
  const warnings: string[] = [];
  const data = new Uint8Array(buffer);
  const loadingTask = getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;

  if (pdf.numPages > PARSER_LIMITS.maxPdfPages) {
    throw new Error("PDF exceeds maximum page limit");
  }

  let totalChars = 0;
  const candidateRows: Array<{ labelRaw: string; rawValue: string; pageNumber: number }> = [];
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

    const matches = pageText.matchAll(
      /([A-Za-z][A-Za-z0-9 &'%/.-]{2,80})\s+(-?₦?\$?\(?[\d,]+(?:\.\d+)?\)?%?)/g,
    );
    for (const match of matches) {
      const labelRaw = neutralizeFormulaLike((match[1] ?? "").trim());
      const rawValue = neutralizeFormulaLike((match[2] ?? "").trim());
      if (!labelRaw || !rawValue) continue;
      candidateRows.push({ labelRaw, rawValue, pageNumber });
    }
  }

  const preview = allText.join("\n").slice(0, 8000);
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
  for (const row of candidateRows) {
    const interpreted = interpretExtractedLine({
      labelRaw: row.labelRaw,
      rawValue: row.rawValue,
      documentUnitScale: scaleMeta.unitScale,
      documentScaleConfidence: scaleMeta.confidence,
      documentScaleRequiresReview: scaleMeta.requiresReview,
    });
    warnings.push(...interpreted.warnings);
    if (!interpreted.normalizedValue) continue;

    const evidenceKey = createHash("sha256")
      .update(
        `${documentId}:pdf:${row.pageNumber}:${row.labelRaw}:${interpreted.normalizedValue}`,
      )
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
        pageNumber: row.pageNumber,
        snippet: `${row.labelRaw} ${row.rawValue}`.slice(0, 200),
      },
    });
  }

  const manualRequired = textPages === 0 || scaleMeta.requiresReview;
  if (textPages === 0) {
    warnings.push("No extractable text found; OCR is not implemented — manual review required");
  } else if (lines.length === 0) {
    warnings.push("Text extracted but no financial figures matched heuristics");
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
    method: "pdfjs-text",
    quality: textPages === 0 ? "MANUAL" : monetaryMapped && !scaleMeta.requiresReview ? "MEDIUM" : "LOW",
    warnings,
    manualRequired,
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
