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

  it("maps B2.2 Increment A concepts without collapsing accounting distinctions", () => {
    expect(mapLabelToConcept("Profit before tax")).toBe("PROFIT_BEFORE_TAX");
    expect(mapLabelToConcept("PBT")).toBe("PROFIT_BEFORE_TAX");
    expect(mapLabelToConcept("Income tax expense")).toBe("INCOME_TAX_EXPENSE");
    expect(mapLabelToConcept("Opening cash and cash equivalents")).toBe(
      "OPENING_CASH_AND_EQUIVALENTS",
    );
    expect(mapLabelToConcept("Opening cash")).toBe("OPENING_CASH_AND_EQUIVALENTS");
    expect(mapLabelToConcept("Net cash used in investing activities")).toBe("INVESTING_CASH_FLOW");
    expect(mapLabelToConcept("Investing cash flow")).toBe("INVESTING_CASH_FLOW");
    expect(mapLabelToConcept("Net cash used in financing activities")).toBe("FINANCING_CASH_FLOW");
    expect(mapLabelToConcept("Financing cash flow")).toBe("FINANCING_CASH_FLOW");
    expect(mapLabelToConcept("Net change in cash")).toBe("NET_CHANGE_IN_CASH");
    expect(mapLabelToConcept("Net increase in cash")).toBe("NET_CHANGE_IN_CASH");
  });

  it("never collapses PBT to net profit or opening cash to closing cash", () => {
    expect(mapLabelToConcept("Profit before tax")).not.toBe("NET_PROFIT");
    expect(mapLabelToConcept("Profit after tax")).toBe("NET_PROFIT");
    expect(mapLabelToConcept("Opening cash and cash equivalents")).not.toBe("CASH_AND_EQUIVALENTS");
    expect(mapLabelToConcept("Closing cash and cash equivalents")).toBe("CASH_AND_EQUIVALENTS");
  });

  it("does not confuse investing CF with capex or financing with borrowings stock", () => {
    expect(mapLabelToConcept("Net cash used in investing activities")).not.toBe(
      "CAPITAL_EXPENDITURE",
    );
    expect(mapLabelToConcept("Capital expenditure")).toBe("CAPITAL_EXPENDITURE");
    expect(mapLabelToConcept("Purchases of property")).toBe("CAPITAL_EXPENDITURE");
    expect(mapLabelToConcept("Net cash used in financing activities")).not.toBe(
      "INTEREST_BEARING_DEBT",
    );
    expect(mapLabelToConcept("Net repayment of borrowings")).toBe("UNMAPPED");
  });

  it("does not confuse income tax expense with tax payable", () => {
    expect(mapLabelToConcept("Income tax expense")).toBe("INCOME_TAX_EXPENSE");
    expect(mapLabelToConcept("Current tax payable")).toBe("UNMAPPED");
    expect(mapLabelToConcept("Tax payable")).toBe("UNMAPPED");
    expect(isKnownUnmappedDistinction("Current tax payable")).toBe(true);
  });

  it("keeps deferred equity and ambiguous labels unmapped", () => {
    expect(isKnownUnmappedDistinction("Retained earnings")).toBe(true);
    expect(mapLabelToConcept("Retained earnings")).toBe("UNMAPPED");
    expect(mapLabelToConcept("Share capital")).toBe("UNMAPPED");
    expect(mapLabelToConcept("Total liabilities and equity")).toBe("UNMAPPED");
    expect(mapLabelToConcept("Total")).toBe("UNMAPPED");
    expect(mapLabelToConcept("Assets")).toBe("UNMAPPED");
    expect(mapLabelToConcept("plant and equipment")).toBe("UNMAPPED");
  });

  it("maps closing cash as CASH_AND_EQUIVALENTS without mapping opening cash to it", () => {
    expect(mapLabelToConcept("Closing cash and cash equivalents")).toBe("CASH_AND_EQUIVALENTS");
    expect(mapLabelToConcept("Opening cash and cash equivalents")).toBe(
      "OPENING_CASH_AND_EQUIVALENTS",
    );
  });
});
