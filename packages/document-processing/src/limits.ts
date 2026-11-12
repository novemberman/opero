/** MVP upload and parser resource limits. */
export const DOCUMENT_MAX_BYTES_DEFAULT = 20 * 1024 * 1024; // 20 MB

export const PARSER_LIMITS = {
  maxCsvRows: 50_000,
  maxCsvColumns: 200,
  maxXlsxSheets: 40,
  maxXlsxRowsPerSheet: 20_000,
  maxXlsxCells: 500_000,
  maxCellChars: 4_000,
  maxPdfPages: 200,
  maxPdfTextChars: 2_000_000,
  parseTimeoutMs: 60_000,
} as const;

export const ALLOWED_MIME_BY_FORMAT = {
  PDF: ["application/pdf"],
  XLSX: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
  ],
  CSV: ["text/csv", "text/plain", "application/csv"],
} as const;

export type DocumentFormatId = keyof typeof ALLOWED_MIME_BY_FORMAT;
