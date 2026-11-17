import { describe, expect, it } from "vitest";
import { assessQuality } from "./quality.js";
import { buildSnapshot } from "./snapshot.js";
import { line } from "./test-fixtures.js";

describe("B2.2 quality identities (advisory, non-scoring)", () => {
  it("records cash-flow section identity failure without lowering gated consistency", () => {
    const snap = buildSnapshot({
      currency: "USD",
      periodLabel: "FY2024",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      lines: [
        line("OPERATING_CASH_FLOW", "100"),
        line("INVESTING_CASH_FLOW", "-40"),
        line("FINANCING_CASH_FLOW", "10"),
        line("NET_CHANGE_IN_CASH", "999"), // inconsistent vs 70
        line("REVENUE", "1000"),
        line("NET_PROFIT", "50"),
        line("TOTAL_ASSETS", "500"),
        line("TOTAL_LIABILITIES", "200"),
        line("EQUITY", "300"),
      ],
    });
    const baseline = assessQuality(
      buildSnapshot({
        currency: "USD",
        periodLabel: "FY2024",
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        lines: [
          line("REVENUE", "1000"),
          line("NET_PROFIT", "50"),
          line("TOTAL_ASSETS", "500"),
          line("TOTAL_LIABILITIES", "200"),
          line("EQUITY", "300"),
        ],
      }),
      [],
    );
    const quality = assessQuality(snap, []);
    expect(quality.details.optionalIdentityFailures).toEqual(
      expect.arrayContaining(["cash_flow_sections"]),
    );
    // score.v1 consistency gate must remain unchanged by advisory B2.2 identities.
    expect(Number(quality.consistency)).toBe(Number(baseline.consistency));
  });

  it("accepts consistent cash roll-forward and equity bridge when present", () => {
    const snap = buildSnapshot({
      currency: "USD",
      periodLabel: "FY2024",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      lines: [
        line("OPERATING_CASH_FLOW", "100"),
        line("INVESTING_CASH_FLOW", "-40"),
        line("FINANCING_CASH_FLOW", "10"),
        line("NET_CHANGE_IN_CASH", "70"),
        line("OPENING_CASH_AND_EQUIVALENTS", "30"),
        line("CASH_AND_EQUIVALENTS", "100"),
        line("SHARE_CAPITAL", "120"),
        line("RETAINED_EARNINGS", "180"),
        line("EQUITY", "300"),
        line("REVENUE", "1000"),
        line("NET_PROFIT", "50"),
        line("TOTAL_ASSETS", "500"),
        line("TOTAL_LIABILITIES", "200"),
      ],
    });
    const quality = assessQuality(snap, []);
    expect(quality.details.optionalIdentityChecks).toEqual(
      expect.arrayContaining(["cash_flow_sections", "cash_roll_forward", "equity_bridge"]),
    );
    expect(quality.details.optionalIdentityFailures).toEqual([]);
    expect(Number(quality.consistency)).toBe(1);
  });

  it("does not invent cash-flow checks when investing/financing are absent", () => {
    const snap = buildSnapshot({
      currency: "USD",
      periodLabel: "FY2024",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      lines: [
        line("OPERATING_CASH_FLOW", "100"),
        line("REVENUE", "1000"),
        line("NET_PROFIT", "50"),
        line("TOTAL_ASSETS", "500"),
        line("TOTAL_LIABILITIES", "200"),
        line("EQUITY", "300"),
      ],
    });
    const withOnlyOcf = assessQuality(snap, []);
    expect(withOnlyOcf.details.optionalIdentityChecks).toEqual([]);
    expect(withOnlyOcf.details.optionalIdentityFailures).toEqual([]);
  });
});
