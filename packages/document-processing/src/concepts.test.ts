import { describe, expect, it } from "vitest";
import { isKnownUnmappedDistinction, mapLabelToConcept } from "./concepts";

describe("mapLabelToConcept", () => {
  it("maps known labels and leaves unknowns unmapped", () => {
    expect(mapLabelToConcept("Total Revenue")).toBe("REVENUE");
    expect(mapLabelToConcept("Turnover")).toBe("REVENUE");
    expect(mapLabelToConcept("Revenue of")).toBe("REVENUE");
    expect(mapLabelToConcept("Cost of sales")).toBe("COST_OF_GOODS_SOLD");
    expect(mapLabelToConcept("Cost of Goods Sold")).toBe("COST_OF_GOODS_SOLD");
    expect(mapLabelToConcept("Net Income")).toBe("NET_PROFIT");
    expect(mapLabelToConcept("Profit after tax")).toBe("NET_PROFIT");
    expect(mapLabelToConcept("Mystery line")).toBe("UNMAPPED");
  });

  it("does not map gross margin to gross profit", () => {
    expect(mapLabelToConcept("Gross margin")).toBe("UNMAPPED");
    expect(mapLabelToConcept("Gross profit")).toBe("GROSS_PROFIT");
  });

  it("preserves distinct unmapped accounting labels", () => {
    expect(isKnownUnmappedDistinction("Profit before tax")).toBe(true);
    expect(mapLabelToConcept("Profit before tax")).toBe("UNMAPPED");
    expect(isKnownUnmappedDistinction("Retained earnings")).toBe(true);
    expect(isKnownUnmappedDistinction("Opening cash and cash equivalents")).toBe(true);
    expect(mapLabelToConcept("Opening cash and cash equivalents")).toBe("UNMAPPED");
  });

  it("maps closing cash as CASH_AND_EQUIVALENTS without mapping opening cash", () => {
    expect(mapLabelToConcept("Closing cash and cash equivalents")).toBe("CASH_AND_EQUIVALENTS");
    expect(mapLabelToConcept("Opening cash and cash equivalents")).toBe("UNMAPPED");
  });
});
