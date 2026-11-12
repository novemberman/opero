import { describe, expect, it } from "vitest";
import {
  detectCurrencies,
  detectPeriodLabel,
  detectUnitScale,
  warnDuplicateNormalizedValues,
} from "./normalize-meta";

describe("normalize-meta", () => {
  it("detects thousands scale and warns on ambiguity", () => {
    expect(detectUnitScale("Amounts in thousands of USD").unitScale).toBe("THOUSANDS");
    expect(detectUnitScale("Amounts in millions").unitScale).toBe("MILLIONS");
    const ambiguous = detectUnitScale("in thousands and in millions");
    expect(ambiguous.unitScale).toBe("ACTUAL");
    expect(ambiguous.warning).toMatch(/Ambiguous unit scale/);
  });

  it("leaves currency unset when multiple currencies appear", () => {
    const result = detectCurrencies("Revenue $100 and also €50");
    expect(result.currency).toBeNull();
    expect(result.warning).toMatch(/Ambiguous currencies/);
  });

  it("detects a single period label and warns on conflicting periods", () => {
    expect(detectPeriodLabel("Income statement for the year ended 31 December 2024").periodLabel).toMatch(
      /year ended/i,
    );
    const ambiguous = detectPeriodLabel("Year ended 2023. Year ended 2024.");
    expect(ambiguous.periodLabel).toBeNull();
    expect(ambiguous.warning).toMatch(/Ambiguous reporting periods/);
  });

  it("flags duplicate mapped figures", () => {
    const warnings = warnDuplicateNormalizedValues([
      { concept: "REVENUE", normalizedValue: "100" },
      { concept: "REVENUE", normalizedValue: "100" },
      { concept: "UNMAPPED", normalizedValue: "100" },
    ]);
    expect(warnings.some((w) => w.includes("Duplicate mapped figure"))).toBe(true);
  });
});
