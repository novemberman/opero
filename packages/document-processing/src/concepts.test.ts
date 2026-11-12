import { describe, expect, it } from "vitest";
import { mapLabelToConcept } from "./concepts";

describe("mapLabelToConcept", () => {
  it("maps known labels and leaves unknowns unmapped", () => {
    expect(mapLabelToConcept("Total Revenue")).toBe("REVENUE");
    expect(mapLabelToConcept("Cost of Goods Sold")).toBe("COST_OF_GOODS_SOLD");
    expect(mapLabelToConcept("Net Income")).toBe("NET_PROFIT");
    expect(mapLabelToConcept("Mystery line")).toBe("UNMAPPED");
  });
});
