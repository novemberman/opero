import { describe, expect, it } from "vitest";
import { DocumentValidationError, validateDocumentBuffer } from "./validate";

describe("validateDocumentBuffer", () => {
  it("accepts CSV content", async () => {
    const csv = Buffer.from("Label,Amount\nRevenue,1000\n", "utf8");
    const result = await validateDocumentBuffer({
      buffer: csv,
      filename: "report.csv",
      declaredMimeType: "text/csv",
    });
    expect(result.format).toBe("CSV");
  });

  it("rejects path traversal filenames by sanitizing to basename", async () => {
    const csv = Buffer.from("a,b\n1,2\n", "utf8");
    const result = await validateDocumentBuffer({
      buffer: csv,
      filename: "../../etc/passwd.csv",
    });
    expect(result.originalFilename).toBe("passwd.csv");
  });

  it("rejects oversized files", async () => {
    await expect(
      validateDocumentBuffer({
        buffer: Buffer.alloc(100),
        filename: "x.csv",
        maxBytes: 10,
      }),
    ).rejects.toBeInstanceOf(DocumentValidationError);
  });

  it("rejects MIME/signature mismatch for PDF extension with non-PDF bytes", async () => {
    await expect(
      validateDocumentBuffer({
        buffer: Buffer.from("not a pdf"),
        filename: "evil.pdf",
        declaredMimeType: "application/pdf",
      }),
    ).rejects.toBeInstanceOf(DocumentValidationError);
  });
});
