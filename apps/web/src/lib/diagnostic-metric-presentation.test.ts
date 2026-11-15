import { describe, expect, it } from "vitest";
import {
  distinctComputedPeriods,
  formatMetricPeriod,
  formatMetricValue,
  groupMetricsByDimension,
  resolveMetricState,
} from "./diagnostic-metric-presentation";

describe("diagnostic-metric-presentation", () => {
  it("formats units and periods without inventing values", () => {
    expect(formatMetricValue("0.41", "ratio")).toBe("0.41");
    expect(formatMetricValue("12.5", "percent")).toBe("12.5%");
    expect(formatMetricValue(null, "ratio")).toBe("—");
    expect(
      formatMetricPeriod({
        code: "X",
        label: "X",
        dimension: "liquidity",
        status: "COMPUTED",
        value: "1",
        unit: "ratio",
        periodLabel: "FY2024",
      }),
    ).toBe("FY2024");
  });

  it("marks non-computed metrics as unavailable", () => {
    expect(
      resolveMetricState({
        code: "QUICK_RATIO",
        label: "Quick ratio",
        dimension: "liquidity",
        status: "INSUFFICIENT_INPUTS",
        value: null,
        unit: "ratio",
      }),
    ).toBe("unavailable");
  });

  it("groups metrics by diagnostic dimension", () => {
    const groups = groupMetricsByDimension([
      {
        code: "GROSS_MARGIN",
        label: "Gross margin",
        dimension: "profitability",
        status: "COMPUTED",
        value: "0.4",
        unit: "ratio",
      },
      {
        code: "CURRENT_RATIO",
        label: "Current ratio",
        dimension: "liquidity",
        status: "COMPUTED",
        value: "1.2",
        unit: "ratio",
      },
      {
        code: "QUICK_RATIO",
        label: "Quick ratio",
        dimension: "liquidity",
        status: "INSUFFICIENT_INPUTS",
        value: null,
        unit: "ratio",
      },
    ]);
    expect(groups.map((g) => g.dimension)).toEqual(["profitability", "liquidity"]);
    expect(groups[1]?.computedCount).toBe(1);
    expect(groups[1]?.unavailableCount).toBe(1);
  });

  it("only lists comparative periods present in computed metrics", () => {
    expect(
      distinctComputedPeriods([
        {
          code: "A",
          label: "A",
          dimension: "profitability",
          status: "COMPUTED",
          value: "1",
          unit: "ratio",
          periodLabel: "FY2024",
        },
        {
          code: "B",
          label: "B",
          dimension: "profitability",
          status: "INSUFFICIENT_INPUTS",
          value: null,
          unit: "ratio",
          periodLabel: "FY2023",
        },
      ]),
    ).toEqual(["FY2024"]);
  });
});
