import type { DocumentFormatId } from "../limits.js";
import type { ExtractionResult } from "../types.js";
import { extractFromCsv } from "./csv.js";
import { extractFromPdf } from "./pdf.js";
import { extractFromXlsx } from "./xlsx.js";

export async function extractFinancialDocument(input: {
  format: DocumentFormatId;
  buffer: Buffer;
  documentId: string;
}): Promise<ExtractionResult> {
  if (input.format === "CSV") {
    return extractFromCsv(input.buffer, input.documentId);
  }
  if (input.format === "XLSX") {
    return extractFromXlsx(input.buffer, input.documentId);
  }
  return extractFromPdf(input.buffer, input.documentId);
}

export { extractFromCsv, extractFromPdf, extractFromXlsx };
