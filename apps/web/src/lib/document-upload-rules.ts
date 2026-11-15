export const DOCUMENT_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

export const DOCUMENT_UPLOAD_ACCEPT =
  ".pdf,.xlsx,.csv,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function formatUploadBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function detectDocumentFormat(fileName: string): "PDF" | "XLSX" | "CSV" | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".xlsx")) return "XLSX";
  if (lower.endsWith(".csv")) return "CSV";
  return null;
}

export type ClientUploadValidation = {
  /** Hard client-side block (format / size). */
  error: string | null;
  /**
   * Advisory-only filename collision warning.
   * Does not block upload — authoritative duplicate-content detection remains on the backend.
   */
  advisoryWarning: string | null;
};

export function validateDocumentUploadClient(
  file: { name: string; size: number },
  existingNames: string[],
): ClientUploadValidation {
  const format = detectDocumentFormat(file.name);
  if (!format) {
    return { error: "Unsupported format. Use PDF, XLSX or CSV.", advisoryWarning: null };
  }
  if (file.size <= 0) {
    return { error: "File appears empty.", advisoryWarning: null };
  }
  if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) {
    return {
      error: `File exceeds the ${formatUploadBytes(DOCUMENT_UPLOAD_MAX_BYTES)} limit.`,
      advisoryWarning: null,
    };
  }

  const duplicate = existingNames.some(
    (name) => name.localeCompare(file.name, undefined, { sensitivity: "accent" }) === 0,
  );
  if (duplicate) {
    return {
      error: null,
      advisoryWarning: `A document named “${file.name}” is already in this workspace. You can still upload; the server detects duplicate content separately. Consider renaming if this is a different file.`,
    };
  }

  return { error: null, advisoryWarning: null };
}
