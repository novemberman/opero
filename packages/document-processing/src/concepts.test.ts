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

  it("maps B2.2 Increment B1 BS/equity/tax concepts without collapsing distinctions", () => {
    expect(mapLabelToConcept("Share capital")).toBe("SHARE_CAPITAL");
    expect(mapLabelToConcept("Retained earnings")).toBe("RETAINED_EARNINGS");
    expect(mapLabelToConcept("Current tax payable")).toBe("TAX_PAYABLE");
    expect(mapLabelToConcept("Tax payable")).toBe("TAX_PAYABLE");
    expect(mapLabelToConcept("Total liabilities and equity")).toBe(
      "TOTAL_LIABILITIES_AND_EQUITY",
    );
    expect(mapLabelToConcept("Total equity and liabilities")).toBe(
      "TOTAL_LIABILITIES_AND_EQUITY",
    );
  });

  it("never collapses share capital to equity or retained earnings to net profit", () => {
    expect(mapLabelToConcept("Share capital")).not.toBe("EQUITY");
    expect(mapLabelToConcept("Equity")).toBe("EQUITY");
    expect(mapLabelToConcept("Total equity")).toBe("EQUITY");
    expect(mapLabelToConcept("Retained earnings")).not.toBe("NET_PROFIT");
    expect(mapLabelToConcept("Net profit")).toBe("NET_PROFIT");
    expect(mapLabelToConcept("Profit after tax")).toBe("NET_PROFIT");
  });

  it("does not confuse tax payable with tax expense or accounts payable", () => {
    expect(mapLabelToConcept("Income tax expense")).toBe("INCOME_TAX_EXPENSE");
    expect(mapLabelToConcept("Current tax payable")).toBe("TAX_PAYABLE");
    expect(mapLabelToConcept("Tax payable")).not.toBe("INCOME_TAX_EXPENSE");
    expect(mapLabelToConcept("Tax payable")).not.toBe("ACCOUNTS_PAYABLE");
    expect(mapLabelToConcept("Accounts payable")).toBe("ACCOUNTS_PAYABLE");
  });

  it("does not confuse liabilities-and-equity total with assets or single-sided totals", () => {
    expect(mapLabelToConcept("Total liabilities and equity")).not.toBe("TOTAL_ASSETS");
    expect(mapLabelToConcept("Total liabilities and equity")).not.toBe("TOTAL_LIABILITIES");
    expect(mapLabelToConcept("Total liabilities and equity")).not.toBe("EQUITY");
    expect(mapLabelToConcept("Total assets")).toBe("TOTAL_ASSETS");
    expect(mapLabelToConcept("Total liabilities")).toBe("TOTAL_LIABILITIES");
  });

  it("keeps deferred WC movements and ambiguous labels unmapped", () => {
    expect(isKnownUnmappedDistinction("Net repayment of borrowings")).toBe(true);
    expect(mapLabelToConcept("Increase in inventory")).toBe("UNMAPPED");
    expect(mapLabelToConcept("Net repayment of borrowings")).toBe("UNMAPPED");
    expect(mapLabelToConcept("Total")).toBe("UNMAPPED");
    expect(mapLabelToConcept("Assets")).toBe("UNMAPPED");
    expect(mapLabelToConcept("capital")).toBe("UNMAPPED");
    expect(mapLabelToConcept("reserves")).toBe("UNMAPPED");
    expect(mapLabelToConcept("plant and equipment")).toBe("UNMAPPED");
    expect(mapLabelToConcept("Number of shares")).toBe("UNMAPPED");
  });

  it("maps closing cash as CASH_AND_EQUIVALENTS without mapping opening cash to it", () => {
    expect(mapLabelToConcept("Closing cash and cash equivalents")).toBe("CASH_AND_EQUIVALENTS");
    expect(mapLabelToConcept("Opening cash and cash equivalents")).toBe(
      "OPENING_CASH_AND_EQUIVALENTS",
    );
  });
});
