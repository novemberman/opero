import { describe, expect, it } from "vitest";
import { extractFromCsv } from "./csv";

describe("extractFromCsv", () => {
  it("extracts mapped revenue with row evidence", () => {
    const buffer = Buffer.from("Label,Amount\nTotal Revenue,\"1,250.50\"\nMystery,10\n", "utf8");
    const result = extractFromCsv(buffer, "doc-1");
    expect(result.statements[0]?.lines.some((l) => l.concept === "REVENUE")).toBe(true);
    const revenue = result.statements[0]?.lines.find((l) => l.concept === "REVENUE");
    expect(revenue?.normalizedValue).toBe("1250.5");
    expect(revenue?.evidence.rowIndex).toBe(2);
    expect(revenue?.evidence.columnIndex).toBe(2);
  });

  it("does not invent zeros for missing amounts and warns on parentheses negatives", () => {
    const buffer = Buffer.from(
      "Label,Amount\nTotal Revenue,\nNet Income,(100.00)\nOther,,\n",
      "utf8",
    );
    const result = extractFromCsv(buffer, "doc-2");
    expect(result.warnings.some((w) => /missing amount/i.test(w))).toBe(true);
    const net = result.statements[0]?.lines.find((l) => l.concept === "NET_PROFIT");
    expect(net?.normalizedValue).toBe("-100");
    expect(result.statements[0]?.lines.some((l) => l.labelRaw === "Total Revenue")).toBe(false);
  });

  it("records thousands scale without inventing period when ambiguous", () => {
    const buffer = Buffer.from(
      "Amounts in thousands USD\nYear ended 2023\nYear ended 2024\nLabel,Amount\nTotal Revenue,12\n",
      "utf8",
    );
    const result = extractFromCsv(buffer, "doc-3");
    expect(result.statements[0]?.unitScale).toBe("THOUSANDS");
    expect(result.statements[0]?.periodLabel).toBeNull();
    expect(result.warnings.some((w) => /Ambiguous reporting periods/i.test(w))).toBe(true);
  });
});
