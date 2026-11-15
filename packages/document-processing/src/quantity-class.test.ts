import { describe, expect, it } from "vitest";
import { classifyQuantity } from "./quantity-class.js";

describe("classifyQuantity", () => {
  it("classifies percentages and margins", () => {
    expect(classifyQuantity({ label: "Gross margin", rawValue: "60.0%" }).quantityClass).toBe(
      "PERCENTAGE",
    );
    expect(classifyQuantity({ label: "Net profit margin", rawValue: "14" }).quantityClass).toBe(
      "PERCENTAGE",
    );
  });

  it("classifies ratios and dates", () => {
    expect(classifyQuantity({ label: "Current ratio", rawValue: "2.00" }).quantityClass).toBe(
      "RATIO",
    );
    expect(
      classifyQuantity({ label: "Year ended 31 December 2025", rawValue: "2025" }).quantityClass,
    ).toBe("DATE");
  });

  it("keeps ordinary monetary amounts", () => {
    expect(classifyQuantity({ label: "Revenue", rawValue: "180,000" }).quantityClass).toBe(
      "MONETARY",
    );
  });

  it("classifies B2.1 verified PDF chrome and note prose as non-monetary", () => {
    expect(classifyQuantity({ label: "NGN THOUSANDS Page", rawValue: "1" }).quantityClass).toBe(
      "OTHER",
    );
    expect(
      classifyQuantity({ label: "Notes to the synthetic statements", rawValue: "1" }).quantityClass,
    ).toBe("NOTE_NUMBER");
    expect(classifyQuantity({ label: "equal liabilities of", rawValue: "70,000" }).quantityClass).toBe(
      "OTHER",
    );
    expect(classifyQuantity({ label: "represents NGN", rawValue: "144,000,000" }).quantityClass).toBe(
      "OTHER",
    );
  });
});
