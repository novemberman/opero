import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractFromCsv } from "../extract/csv.js";
import { applyUnitScale } from "../interpret-line.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("Netshift Digital Ltd FY2025 regression fixture", () => {
  const buffer = readFileSync(join(here, "netshift-fy2025.csv"));
  const result = extractFromCsv(buffer, "netshift-fy2025");
  const statement = result.statements[0]!;

  it("detects NGN thousands scale with review not required", () => {
    expect(statement.currency).toBe("NGN");
    expect(statement.unitScale).toBe("THOUSANDS");
    expect(statement.unitScaleRequiresReview).toBe(false);
    expect(statement.entityName).toMatch(/Netshift Digital Ltd/i);
    expect(statement.periodLabel).toMatch(/31 December 2025/i);
  });

  it("normalizes key monetary figures to expected NGN actuals", () => {
    const expected: Record<string, string> = {
      REVENUE: "180000000",
      GROSS_PROFIT: "108000000",
      NET_PROFIT: "25200000",
      CASH_AND_EQUIVALENTS: "32000000",
      CURRENT_ASSETS: "70000000",
      CURRENT_LIABILITIES: "35000000",
      TOTAL_ASSETS: "165000000",
      TOTAL_LIABILITIES: "80000000",
      EQUITY: "85000000",
      OPERATING_CASH_FLOW: "33000000",
    };

    for (const [concept, actual] of Object.entries(expected)) {
      const line = statement.lines.find((l) => l.concept === concept);
      expect(line, concept).toBeTruthy();
      expect(line!.quantityClass).toBe("MONETARY");
      expect(line!.rawValue.replace(/,/g, "")).toMatch(/^\d/);
      expect(applyUnitScale(line!.normalizedValue, line!.unitScale)).toBe(actual);
    }
  });

  it("does not treat percentages or ratios as monetary concepts", () => {
    const grossMargin = statement.lines.find((l) => /gross margin/i.test(l.labelRaw));
    expect(grossMargin?.quantityClass).toBe("PERCENTAGE");
    expect(grossMargin?.concept).toBe("UNMAPPED");

    const currentRatio = statement.lines.find((l) => /current ratio/i.test(l.labelRaw));
    expect(currentRatio?.quantityClass).toBe("RATIO");
    expect(currentRatio?.concept).toBe("UNMAPPED");

    const netMargin = statement.lines.find((l) => /net profit margin/i.test(l.labelRaw));
    expect(netMargin?.quantityClass).toBe("PERCENTAGE");
  });

  it("maps B2.2 Increment A PBT / investing / financing without collapsing to PAT or CapEx", () => {
    const pbt = statement.lines.find((l) => /profit before tax/i.test(l.labelRaw));
    expect(pbt?.concept).toBe("PROFIT_BEFORE_TAX");
    expect(pbt?.quantityClass).toBe("MONETARY");
    expect(applyUnitScale(pbt!.normalizedValue, pbt!.unitScale)).toBe("36000000");

    const investing = statement.lines.find((l) => /investing cash flow/i.test(l.labelRaw));
    expect(investing?.concept).toBe("INVESTING_CASH_FLOW");
    expect(investing?.concept).not.toBe("CAPITAL_EXPENDITURE");

    const financing = statement.lines.find((l) => /financing cash flow/i.test(l.labelRaw));
    expect(financing?.concept).toBe("FINANCING_CASH_FLOW");
  });

  it("reports balance-sheet consistency for the fixture", () => {
    const identity = result.consistency.find((c) => c.code === "BALANCE_SHEET_IDENTITY");
    expect(identity?.status).toBe("CONSISTENT");
  });
});
