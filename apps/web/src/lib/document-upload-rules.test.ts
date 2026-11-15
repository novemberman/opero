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
    expect(validateDocumentUploadClient({ name: "a.pdf", size: 0 }, []).error).toMatch(
      /empty/i,
    );
    expect(
      validateDocumentUploadClient(
        { name: "a.pdf", size: DOCUMENT_UPLOAD_MAX_BYTES + 1 },
        [],
      ).error,
    ).toContain(formatUploadBytes(DOCUMENT_UPLOAD_MAX_BYTES));
  });

  it("treats duplicate filenames as advisory warnings, not hard blocks", () => {
    const duplicate = validateDocumentUploadClient(
      { name: "Statement.pdf", size: 100 },
      ["statement.pdf"],
    );
    expect(duplicate.error).toBeNull();
    expect(duplicate.advisoryWarning).toMatch(/already in this workspace/i);

    const unique = validateDocumentUploadClient({ name: "Statement.pdf", size: 100 }, [
      "other.pdf",
    ]);
    expect(unique.error).toBeNull();
    expect(unique.advisoryWarning).toBeNull();
  });
});
