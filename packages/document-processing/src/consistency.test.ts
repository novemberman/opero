import { describe, expect, it } from "vitest";
import { checkFinancialConsistency } from "./consistency.js";

describe("checkFinancialConsistency", () => {
  it("validates A = L + E within tolerance", () => {
    const findings = checkFinancialConsistency([
      { concept: "TOTAL_ASSETS", normalizedValue: "165", unitScale: "THOUSANDS", quantityClass: "MONETARY" },
      {
        concept: "TOTAL_LIABILITIES",
        normalizedValue: "80",
        unitScale: "THOUSANDS",
        quantityClass: "MONETARY",
      },
      { concept: "EQUITY", normalizedValue: "85", unitScale: "THOUSANDS", quantityClass: "MONETARY" },
    ]);
    expect(findings.find((f) => f.code === "BALANCE_SHEET_IDENTITY")?.status).toBe("CONSISTENT");
  });

  it("flags inconsistent balance sheets", () => {
    const findings = checkFinancialConsistency([
      { concept: "TOTAL_ASSETS", normalizedValue: "100", unitScale: "ACTUAL", quantityClass: "MONETARY" },
      {
        concept: "TOTAL_LIABILITIES",
        normalizedValue: "40",
        unitScale: "ACTUAL",
        quantityClass: "MONETARY",
      },
      { concept: "EQUITY", normalizedValue: "10", unitScale: "ACTUAL", quantityClass: "MONETARY" },
    ]);
    expect(findings.find((f) => f.code === "BALANCE_SHEET_IDENTITY")?.status).toBe("INCONSISTENT");
  });

  it("returns insufficient evidence when inputs are missing", () => {
    const findings = checkFinancialConsistency([
      { concept: "REVENUE", normalizedValue: "10", unitScale: "ACTUAL", quantityClass: "MONETARY" },
    ]);
    expect(findings.find((f) => f.code === "BALANCE_SHEET_IDENTITY")?.status).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
  });
});
