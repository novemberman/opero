import { describe, expect, it } from "vitest";
import { neutralizeFormulaLike, parseFinancialNumber } from "./money";

describe("parseFinancialNumber", () => {
  it("parses common formats with decimal safety", () => {
    expect(parseFinancialNumber("1,234.56")).toBe("1234.56");
    expect(parseFinancialNumber("$(1,000.00)")).toBe("-1000");
    expect(parseFinancialNumber("500-")).toBe("-500");
    expect(parseFinancialNumber("0")).toBe("0");
    expect(parseFinancialNumber("0.00")).toBe("0");
    expect(parseFinancialNumber("")).toBeNull();
    expect(parseFinancialNumber("—")).toBeNull();
    expect(parseFinancialNumber("n/a")).toBeNull();
    expect(parseFinancialNumber("not a number")).toBeNull();
    expect(parseFinancialNumber("1.234.567,89")).toBeNull();
  });

  it("preserves high decimal precision without IEEE float drift", () => {
    expect(parseFinancialNumber("123456789012345.67")).toBe("123456789012345.67");
    expect(parseFinancialNumber("(0.01)")).toBe("-0.01");
  });

  it("neutralizes formula-like cells", () => {
    expect(neutralizeFormulaLike("=1+1")).toBe("'=1+1");
    expect(neutralizeFormulaLike("+cmd")).toBe("'+cmd");
    expect(neutralizeFormulaLike("Revenue")).toBe("Revenue");
  });
});
