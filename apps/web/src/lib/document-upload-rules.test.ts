import { describe, expect, it } from "vitest";
import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  detectDocumentFormat,
  formatUploadBytes,
  validateDocumentUploadClient,
} from "./document-upload-rules";

describe("document-upload-rules", () => {
  it("detects supported formats", () => {
    expect(detectDocumentFormat("a.PDF")).toBe("PDF");
    expect(detectDocumentFormat("b.xlsx")).toBe("XLSX");
    expect(detectDocumentFormat("c.csv")).toBe("CSV");
    expect(detectDocumentFormat("d.doc")).toBeNull();
  });

  it("rejects oversized and empty files", () => {
    expect(
      validateDocumentUploadClient({ name: "a.pdf", size: 0 }, []),
    ).toMatch(/empty/i);
    expect(
      validateDocumentUploadClient(
        { name: "a.pdf", size: DOCUMENT_UPLOAD_MAX_BYTES + 1 },
        [],
      ),
    ).toContain(formatUploadBytes(DOCUMENT_UPLOAD_MAX_BYTES));
  });

  it("soft-blocks duplicate filenames", () => {
    expect(
      validateDocumentUploadClient({ name: "Statement.pdf", size: 100 }, ["statement.pdf"]),
    ).toMatch(/already in this workspace/i);
    expect(
      validateDocumentUploadClient({ name: "Statement.pdf", size: 100 }, ["other.pdf"]),
    ).toBeNull();
  });
});
