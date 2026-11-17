import { describe, expect, it } from "vitest";
import { runDiagnosticEngine } from "./engine.js";
import { computeMetrics } from "./kpi.js";
import { d, toPlain } from "./decimal.js";
import { buildSnapshot } from "./snapshot.js";
import { healthySnapshot, line } from "./test-fixtures.js";

/**
 * Golden NGN ACTUAL ×1 synthetic fixture — identity and source-to-metric checks.
 * Values mirror the approved pilot-scale statement shape (ACTUAL units, NGN).
 */
function ngnActualGoldenSnapshot() {
  return buildSnapshot({
    currency: "NGN",
    periodStart: "2024-01-01",
    periodEnd: "2024-12-31",
    periodLabel: "FY2024",
    lines: [
      line("REVENUE", "144000000", {
        currency: "NGN",
        unitScale: "ACTUAL",
        periodLabel: "FY2023",
        periodStart: "2023-01-01",
        periodEnd: "2023-12-31",
      }),
      line("NET_PROFIT", "20000000", {
        currency: "NGN",
        unitScale: "ACTUAL",
        periodLabel: "FY2023",
        periodStart: "2023-01-01",
        periodEnd: "2023-12-31",
      }),
      line("REVENUE", "180000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("COST_OF_GOODS_SOLD", "72000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("GROSS_PROFIT", "108000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("OPERATING_EXPENSES", "48000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("OPERATING_PROFIT", "60000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("INTEREST_EXPENSE", "5000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("PROFIT_BEFORE_TAX", "55000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("INCOME_TAX_EXPENSE", "15000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("NET_PROFIT", "40000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("CASH_AND_EQUIVALENTS", "25000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("ACCOUNTS_RECEIVABLE", "30000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("INVENTORY", "20000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("CURRENT_ASSETS", "90000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("TOTAL_ASSETS", "200000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("ACCOUNTS_PAYABLE", "15000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("CURRENT_LIABILITIES", "45000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("INTEREST_BEARING_DEBT", "40000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("TOTAL_LIABILITIES", "80000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("EQUITY", "120000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("TOTAL_LIABILITIES_AND_EQUITY", "200000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("OPERATING_CASH_FLOW", "50000000", { currency: "NGN", unitScale: "ACTUAL" }),
      line("CAPITAL_EXPENDITURE", "10000000", { currency: "NGN", unitScale: "ACTUAL" }),
    ],
  });
}

describe("golden financial fixture", () => {
  it("preserves NGN ACTUAL ×1 normalization on snapshot lines", () => {
    const snap = ngnActualGoldenSnapshot();
    expect(snap.currency).toBe("NGN");
    const revenue = snap.lines.find((l) => l.concept === "REVENUE" && l.periodLabel === "FY2024");
    expect(revenue?.unitScale).toBe("ACTUAL");
    expect(revenue?.actualValue).toBe("180000000");
  });

  it("holds gross / operating / PBT / net profit identities", () => {
    const snap = ngnActualGoldenSnapshot();
    const by = (c: string) => snap.lines.find((l) => l.concept === c && l.periodLabel === "FY2024")!;
    const rev = d(by("REVENUE").actualValue!);
    const cogs = d(by("COST_OF_GOODS_SOLD").actualValue!);
    const gp = d(by("GROSS_PROFIT").actualValue!);
    const opex = d(by("OPERATING_EXPENSES").actualValue!);
    const op = d(by("OPERATING_PROFIT").actualValue!);
    const interest = d(by("INTEREST_EXPENSE").actualValue!);
    const pbt = d(by("PROFIT_BEFORE_TAX").actualValue!);
    const tax = d(by("INCOME_TAX_EXPENSE").actualValue!);
    const net = d(by("NET_PROFIT").actualValue!);

    expect(toPlain(rev.minus(cogs))).toBe(toPlain(gp));
    expect(toPlain(gp.minus(opex))).toBe(toPlain(op));
    expect(toPlain(op.minus(interest))).toBe(toPlain(pbt));
    expect(toPlain(pbt.minus(tax))).toBe(toPlain(net));
  });

  it("holds balance sheet equality", () => {
    const snap = ngnActualGoldenSnapshot();
    const by = (c: string) => snap.lines.find((l) => l.concept === c)!;
    const assets = d(by("TOTAL_ASSETS").actualValue!);
    const liab = d(by("TOTAL_LIABILITIES").actualValue!);
    const equity = d(by("EQUITY").actualValue!);
    const totalLE = d(by("TOTAL_LIABILITIES_AND_EQUITY").actualValue!);
    expect(toPlain(liab.plus(equity))).toBe(toPlain(assets));
    expect(toPlain(totalLE)).toBe(toPlain(assets));
  });

  it("computes required metrics with source-to-metric traceability", () => {
    const snap = ngnActualGoldenSnapshot();
    const m = Object.fromEntries(computeMetrics(snap).map((x) => [x.code, x]));

    expect(m.GROSS_MARGIN?.value).toBe("0.6"); // 108/180
    expect(Number(m.OPERATING_MARGIN?.value)).toBeCloseTo(60 / 180, 10);
    expect(Number(m.NET_MARGIN?.value)).toBeCloseTo(40 / 180, 10);
    expect(Number(m.RETURN_ON_ASSETS?.value)).toBeCloseTo(40 / 200, 10);
    expect(Number(m.RETURN_ON_EQUITY?.value)).toBeCloseTo(40 / 120, 10);
    expect(m.CURRENT_RATIO?.value).toBe("2"); // 90/45
    expect(Number(m.QUICK_RATIO?.value)).toBeCloseTo(70 / 45, 10);
    expect(m.WORKING_CAPITAL?.value).toBe("45000000");
    expect(Number(m.CASH_COVERAGE?.value)).toBeCloseTo(50 / 5, 10);
    expect(Number(m.DEBT_TO_EQUITY?.value)).toBeCloseTo(40 / 120, 10);
    expect(Number(m.DEBT_TO_ASSETS?.value)).toBeCloseTo(40 / 200, 10);
    expect(m.LIABILITIES_TO_ASSETS?.value).toBe("0.4");
    expect(m.INTEREST_COVERAGE?.value).toBe("12"); // 60/5
    expect(m.ASSET_TURNOVER?.value).toBe("0.9"); // 180/200
    expect(m.RECEIVABLES_TURNOVER?.value).toBe("6"); // 180/30
    expect(m.PAYABLES_TURNOVER?.value).toBe("4.8"); // 72/15
    expect(m.REVENUE_GROWTH?.value).toBe("0.25"); // (180-144)/144
    expect(m.PROFIT_GROWTH?.value).toBe("1"); // (40-20)/20
    expect(Number(m.NET_MARGIN_MOVEMENT?.value)).toBeCloseTo(40 / 180 - 20 / 144, 10);

    for (const code of [
      "GROSS_MARGIN",
      "RETURN_ON_ASSETS",
      "DEBT_TO_ASSETS",
      "ASSET_TURNOVER",
      "CASH_COVERAGE",
      "PROFIT_GROWTH",
      "NET_MARGIN_MOVEMENT",
    ]) {
      expect(m[code]?.status).toBe("COMPUTED");
      expect(m[code]?.inputRefs.length).toBeGreaterThan(0);
      expect(m[code]?.formulaId.startsWith("calc.v1.")).toBe(true);
    }
  });

  it("does not invent missing inputs on partial golden subset", () => {
    const snap = buildSnapshot({
      currency: "NGN",
      lines: [line("REVENUE", "180000000", { currency: "NGN", unitScale: "ACTUAL" })],
    });
    const m = Object.fromEntries(computeMetrics(snap).map((x) => [x.code, x]));
    expect(m.RETURN_ON_ASSETS?.status).toBe("INSUFFICIENT_INPUTS");
    expect(m.RETURN_ON_ASSETS?.value).toBeNull();
    expect(m.CASH_COVERAGE?.status).toBe("INSUFFICIENT_INPUTS");
    expect(m.PROFIT_GROWTH?.status).toBe("INSUFFICIENT_INPUTS");
  });

  it("healthy fixture new KPIs match independent expectations", () => {
    const m = Object.fromEntries(computeMetrics(healthySnapshot()).map((x) => [x.code, x]));
    expect(m.RETURN_ON_ASSETS?.value).toBe("0.3"); // 300/1000
    expect(m.RETURN_ON_EQUITY?.value).toBe("0.5"); // 300/600
    expect(m.ASSET_TURNOVER?.value).toBe("1.2"); // 1200/1000
    expect(m.DEBT_TO_ASSETS?.value).toBe("0.2"); // 200/1000
    expect(m.CASH_COVERAGE?.value).toBe("8.75"); // 350/40
    expect(m.PROFIT_GROWTH?.value).toBe("0.2"); // (300-250)/250
    expect(m.NET_MARGIN_MOVEMENT?.value).toBe("0"); // 0.25 - 0.25
  });

  it("engine remains deterministic on golden fixture", () => {
    const snap = ngnActualGoldenSnapshot();
    const a = runDiagnosticEngine(snap);
    const b = runDiagnosticEngine(snap);
    expect(a.score).toEqual(b.score);
    expect(a.metrics.map((m) => [m.code, m.status, m.value])).toEqual(
      b.metrics.map((m) => [m.code, m.status, m.value]),
    );
  });
});
