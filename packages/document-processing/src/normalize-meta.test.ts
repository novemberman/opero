import { describe, expect, it } from "vitest";
import {
  analyzeDuplicateMappedFigures,
  detectCurrencies,
  detectEntityName,
  detectPeriodLabel,
  detectUnitScale,
  warnDuplicateNormalizedValues,
} from "./normalize-meta";

describe("normalize-meta", () => {
  it("detects thousands scale including NGN forms", () => {
    expect(detectUnitScale("Amounts in thousands of USD").unitScale).toBe("THOUSANDS");
    expect(detectUnitScale("Amounts in ₦'000").unitScale).toBe("THOUSANDS");
    expect(detectUnitScale("Amounts in ₦'000").requiresReview).toBe(false);
    expect(detectUnitScale("Amounts in millions").unitScale).toBe("MILLIONS");
    const ambiguous = detectUnitScale("in thousands and in millions");
    expect(ambiguous.unitScale).toBe("ACTUAL");
    expect(ambiguous.requiresReview).toBe(true);
    expect(ambiguous.warning).toMatch(/Ambiguous unit scale/);
  });

  it("requires review when no scale label is present", () => {
    const missing = detectUnitScale("Revenue and expenses");
    expect(missing.unitScale).toBe("ACTUAL");
    expect(missing.requiresReview).toBe(true);
    expect(missing.confidence).toBe("UNKNOWN");
  });

  it("detects NGN and leaves multi-currency unset", () => {
    expect(detectCurrencies("Currency NGN and ₦ figures").currency).toBe("NGN");
    const result = detectCurrencies("Revenue $100 and also €50");
    expect(result.currency).toBeNull();
    expect(result.warning).toMatch(/Ambiguous currencies/);
  });

  it("detects a single period label and entity name", () => {
    expect(detectPeriodLabel("Income statement for the year ended 31 December 2024").periodLabel).toMatch(
      /year ended/i,
    );
    expect(detectEntityName("Netshift Digital Ltd FY2025 accounts").entityName).toMatch(
      /Netshift Digital Ltd/,
    );
    const ambiguous = detectPeriodLabel("Year ended 2023. Year ended 2024.");
    expect(ambiguous.periodLabel).toBeNull();
    expect(ambiguous.warning).toMatch(/Ambiguous reporting periods/);
  });

  it("flags duplicate mapped figures with kinds", () => {
    const { findings, warnings } = analyzeDuplicateMappedFigures([
      { concept: "REVENUE", normalizedValue: "100" },
      { concept: "REVENUE", normalizedValue: "100" },
      { concept: "UNMAPPED", normalizedValue: "100" },
    ]);
    expect(findings[0]?.kind).toBe("CORROBORATING");
    expect(warnings.some((w) => w.includes("Duplicate mapped figure"))).toBe(true);
    expect(
      warnDuplicateNormalizedValues([
        { concept: "REVENUE", normalizedValue: "100" },
        { concept: "REVENUE", normalizedValue: "100" },
      ]).length,
    ).toBeGreaterThan(0);
  });
});
