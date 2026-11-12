import { fileTypeFromBuffer } from "file-type";
import { ALLOWED_MIME_BY_FORMAT, DOCUMENT_MAX_BYTES_DEFAULT, type DocumentFormatId } from "./limits.js";
import { sanitizeOriginalFilename } from "./filenames.js";

export type ValidatedDocument = {
  format: DocumentFormatId;
  mimeType: string;
  originalFilename: string;
  byteSize: number;
  buffer: Buffer;
};

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentValidationError";
  }
}

function extensionFor(format: DocumentFormatId): string[] {
  if (format === "PDF") return [".pdf"];
  if (format === "XLSX") return [".xlsx"];
  return [".csv"];
}

function sniffCsv(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString("utf8");
  if (sample.includes("\u0000")) {
    return false;
  }
  const lines = sample.split(/\r?\n/).filter((line) => line.length > 0).slice(0, 5);
  if (lines.length === 0) {
    return false;
  }
  return lines.some((line) => /[,;\t|]/.test(line));
}

function isZipEncryptedOrMacroHeavy(buffer: Buffer): boolean {
  // OOXML is a ZIP. Reject encrypted packages (EncryptionInfo) and VBA macros (vbaProject.bin).
  const asString = buffer.toString("binary");
  if (asString.includes("EncryptionInfo") || asString.includes("EncryptedPackage")) {
    return true;
  }
  if (asString.includes("vbaProject.bin")) {
    return true;
  }
  return false;
}

function isPdfEncrypted(buffer: Buffer): boolean {
  const text = buffer.subarray(0, Math.min(buffer.length, 64_000)).toString("latin1");
  return /\/Encrypt[\s/]/.test(text);
}

export async function validateDocumentBuffer(input: {
  buffer: Buffer;
  filename: string;
  declaredMimeType?: string;
  maxBytes?: number;
}): Promise<ValidatedDocument> {
  const maxBytes = input.maxBytes ?? DOCUMENT_MAX_BYTES_DEFAULT;
  if (input.buffer.byteLength === 0) {
    throw new DocumentValidationError("Empty file rejected");
  }
  if (input.buffer.byteLength > maxBytes) {
    throw new DocumentValidationError(`File exceeds maximum size of ${maxBytes} bytes`);
  }

  const originalFilename = sanitizeOriginalFilename(input.filename);
  const lower = originalFilename.toLowerCase();
  const detected = await fileTypeFromBuffer(input.buffer);

  let format: DocumentFormatId | null = null;
  let mimeType = detected?.mime ?? input.declaredMimeType ?? "application/octet-stream";

  if (detected?.mime === "application/pdf" || lower.endsWith(".pdf")) {
    if (detected && detected.mime !== "application/pdf") {
      throw new DocumentValidationError("MIME/signature mismatch for PDF");
    }
    if (!input.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new DocumentValidationError("Invalid PDF signature");
    }
    if (isPdfEncrypted(input.buffer)) {
      throw new DocumentValidationError("Encrypted PDF is not supported");
    }
    format = "PDF";
    mimeType = "application/pdf";
  } else if (
    detected?.mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    detected?.mime === "application/zip" ||
    lower.endsWith(".xlsx")
  ) {
    if (!lower.endsWith(".xlsx")) {
      throw new DocumentValidationError("ZIP archives must use .xlsx for spreadsheet uploads");
    }
    if (isZipEncryptedOrMacroHeavy(input.buffer)) {
      throw new DocumentValidationError("Encrypted or macro-enabled workbooks are not supported");
    }
    format = "XLSX";
    mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  } else if (lower.endsWith(".csv") || sniffCsv(input.buffer)) {
    if (detected && detected.mime !== "text/csv" && detected.mime !== "text/plain") {
      // file-type often returns undefined for CSV; reject binary detections.
      throw new DocumentValidationError("MIME/signature mismatch for CSV");
    }
    if (!sniffCsv(input.buffer)) {
      throw new DocumentValidationError("Invalid CSV structure");
    }
    format = "CSV";
    mimeType = "text/csv";
  }

  if (!format) {
    throw new DocumentValidationError("Unsupported file format");
  }

  if (!extensionFor(format).some((ext) => lower.endsWith(ext))) {
    throw new DocumentValidationError(`Filename extension does not match ${format}`);
  }

  const allowed = ALLOWED_MIME_BY_FORMAT[format] as readonly string[];
  if (input.declaredMimeType && !allowed.includes(input.declaredMimeType) && input.declaredMimeType !== "application/octet-stream") {
    // Declared MIME is advisory; signature wins, but gross mismatches fail.
    if (format === "PDF" && input.declaredMimeType !== "application/pdf") {
      throw new DocumentValidationError("Declared MIME does not match PDF content");
    }
  }

  return {
    format,
    mimeType,
    originalFilename,
    byteSize: input.buffer.byteLength,
    buffer: input.buffer,
  };
}
