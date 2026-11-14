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
});
