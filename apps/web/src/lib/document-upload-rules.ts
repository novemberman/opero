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

export function validateDocumentUploadClient(
  file: { name: string; size: number },
  existingNames: string[],
): string | null {
  const format = detectDocumentFormat(file.name);
  if (!format) return "Unsupported format. Use PDF, XLSX or CSV.";
  if (file.size <= 0) return "File appears empty.";
  if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) {
    return `File exceeds the ${formatUploadBytes(DOCUMENT_UPLOAD_MAX_BYTES)} limit.`;
  }
  const duplicate = existingNames.some(
    (name) => name.localeCompare(file.name, undefined, { sensitivity: "accent" }) === 0,
  );
  if (duplicate) {
    return `A document named “${file.name}” is already in this workspace. Rename the file or open the existing document.`;
  }
  return null;
}
