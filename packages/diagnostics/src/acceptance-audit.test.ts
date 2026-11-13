import { describe, expect, it } from "vitest";
import { runDiagnosticEngine } from "./engine.js";
import { computeMetrics } from "./kpi.js";
import { buildSnapshot } from "./snapshot.js";
import { healthySnapshot, line } from "./test-fixtures.js";

function byCode(metrics: ReturnType<typeof computeMetrics>) {
  return Object.fromEntries(metrics.map((m) => [m.code, m]));
}

describe("acceptance audit — formula independence", () => {
  it("matches independently calculated healthy KPIs", () => {
    // Fixture: Rev 1200, COGS 480, GP 720, Opex 300, Op 420, NI 300,
    // Cash 200, AR 100, AP 80, Inv 120, CA 500, CL 250, TA 1000, TL 400,
    // Equity 600, Debt 200, Interest 40, OCF 350, Capex 50; prior Rev 1000
    const m = byCode(computeMetrics(healthySnapshot()));
    expect(m.GROSS_MARGIN?.value).toBe("0.6"); // 720/1200
    expect(m.OPERATING_MARGIN?.value).toBe("0.35"); // 420/1200
    expect(m.NET_MARGIN?.value).toBe("0.25"); // 300/1200
    expect(m.OPEX_RATIO?.value).toBe("0.25"); // 300/1200
    expect(m.COGS_RATIO?.value).toBe("0.4"); // 480/1200
    expect(m.REVENUE_GROWTH?.value).toBe("0.2"); // (1200-1000)/1000
    expect(m.CURRENT_RATIO?.value).toBe("2"); // 500/250
    expect(m.QUICK_RATIO?.value).toBe("1.52"); // (500-120)/250
    expect(m.CASH_RATIO?.value).toBe("0.8"); // 200/250
    expect(m.WORKING_CAPITAL?.value).toBe("250"); // 500-250
    expect(Number(m.DEBT_TO_EQUITY?.value)).toBeCloseTo(1 / 3, 10); // 200/600
    expect(m.LIABILITIES_TO_ASSETS?.value).toBe("0.4"); // 400/1000
    expect(m.INTEREST_COVERAGE?.value).toBe("10.5"); // 420/40
    expect(m.RECEIVABLES_TURNOVER?.value).toBe("12"); // 1200/100 (point-in-time)
    expect(Number(m.DSO?.value)).toBeCloseTo(366 / 12, 5); // days/turnover
    expect(m.INVENTORY_TURNOVER?.value).toBe("4"); // 480/120
    expect(Number(m.INVENTORY_DAYS?.value)).toBeCloseTo(366 / 4, 5);
    expect(m.PAYABLES_TURNOVER?.value).toBe("6"); // 480/80
    expect(Number(m.PAYABLES_DAYS?.value)).toBeCloseTo(366 / 6, 5);
    expect(Number(m.CASH_CONVERSION_CYCLE?.value)).toBeCloseTo(366 / 12 + 366 / 4 - 366 / 6, 5);
    expect(Number(m.OCF_MARGIN?.value)).toBeCloseTo(350 / 1200, 10);
    expect(Number(m.OCF_TO_CURRENT_LIABILITIES?.value)).toBeCloseTo(350 / 250, 10);
    expect(m.FREE_CASH_FLOW?.value).toBe("300"); // 350-50
  });

  it("does not use total liabilities as debt-to-equity", () => {
    const snap = buildSnapshot({
      currency: "USD",
      lines: [line("TOTAL_LIABILITIES", "900"), line("EQUITY", "100")],
    });
    expect(byCode(computeMetrics(snap)).DEBT_TO_EQUITY?.status).toBe("INSUFFICIENT_INPUTS");
  });

  it("marks zero/negative denominators UNDEFINED and missing as INSUFFICIENT", () => {
    const zeroRev = buildSnapshot({
      currency: "USD",
      lines: [line("REVENUE", "0"), line("NET_PROFIT", "10")],
    });
    expect(byCode(computeMetrics(zeroRev)).NET_MARGIN?.status).toBe("UNDEFINED");

    const negEquity = buildSnapshot({
      currency: "USD",
      lines: [line("INTEREST_BEARING_DEBT", "50"), line("EQUITY", "-10")],
    });
    expect(byCode(computeMetrics(negEquity)).DEBT_TO_EQUITY?.status).toBe("UNDEFINED");

    const missing = buildSnapshot({ currency: "USD", lines: [line("REVENUE", "100")] });
    expect(byCode(computeMetrics(missing)).OCF_MARGIN?.status).toBe("INSUFFICIENT_INPUTS");
    expect(byCode(computeMetrics(missing)).QUICK_RATIO?.status).toBe("INSUFFICIENT_INPUTS");
  });

  it("rejects annual vs quarterly revenue growth as INCOMPATIBLE", () => {
    const snap = buildSnapshot({
      currency: "USD",
      lines: [
        line("REVENUE", "100", {
          periodStart: "2024-01-01",
          periodEnd: "2024-03-31",
          periodLabel: "Q1",
        }),
        line("REVENUE", "400", {
          periodStart: "2024-01-01",
          periodEnd: "2024-12-31",
          periodLabel: "FY2024",
        }),
      ],
    });
    expect(byCode(computeMetrics(snap)).REVENUE_GROWTH?.status).toBe("INCOMPATIBLE");
  });

  it("does not mix multi-currency amounts when run currency is unset", () => {
    const snap = buildSnapshot({
      lines: [
        line("REVENUE", "100", { currency: "USD" }),
        line("NET_PROFIT", "10", { currency: "EUR" }),
      ],
    });
    expect(snap.currency).toBeNull();
    expect(byCode(computeMetrics(snap)).NET_MARGIN?.status).toBe("INCOMPATIBLE");
  });
});

describe("acceptance audit — ten scoring scenarios", () => {
  function summarize(name: string, snap: ReturnType<typeof buildSnapshot>) {
    const result = runDiagnosticEngine(snap);
    const computed = result.metrics.filter((m) => m.status === "COMPUTED").map((m) => m.code);
    const dims = result.score.components.filter((c) => c.included).map((c) => c.dimension);
    return {
      name,
      computed,
      dims,
      coverage: result.quality.diagnosticCoverage,
      reliability: result.quality.evidenceReliability,
      consistency: result.quality.consistency,
      scoreStatus: result.score.status,
      overall: result.score.overallScore,
      findings: result.findings.map((f) => f.ruleId),
      result,
    };
  }

  it("1 profitable + strong liquidity → SCORED and economically reasonable", () => {
    const s = summarize("healthy", healthySnapshot());
    expect(s.scoreStatus).toBe("SCORED");
    expect(s.overall).toBeGreaterThan(50);
    expect(s.dims.length).toBeGreaterThanOrEqual(3);
  });

  it("2 profitable with negative OCF → risk finding; may still score", () => {
    const snap = buildSnapshot({
      currency: "USD",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      lines: [
        line("REVENUE", "1000"),
        line("NET_PROFIT", "120"),
        line("OPERATING_PROFIT", "150"),
        line("OPERATING_CASH_FLOW", "-80"),
        line("CURRENT_ASSETS", "400"),
        line("CURRENT_LIABILITIES", "200"),
        line("INVENTORY", "50"),
        line("TOTAL_ASSETS", "800"),
        line("TOTAL_LIABILITIES", "300"),
        line("EQUITY", "500"),
        line("CASH_AND_EQUIVALENTS", "40"),
      ],
    });
    const s = summarize("neg-ocf", snap);
    expect(s.findings).toContain("OCF_NEG_NI_POS");
    expect(s.scoreStatus).toBe("SCORED");
    // Cash-flow component should be weak relative to profitability
    const cf = s.result.score.components.find((c) => c.dimension === "cash_flow");
    const prof = s.result.score.components.find((c) => c.dimension === "profitability");
    expect(cf?.included).toBe(true);
    expect(prof?.included).toBe(true);
    expect((cf?.score ?? 100)).toBeLessThan((prof?.score ?? 0));
  });

  it("3 growing revenue + declining margins triggers REV_UP_MARGIN_DOWN", () => {
    const snap = buildSnapshot({
      currency: "USD",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      lines: [
        line("REVENUE", "1000", {
          periodStart: "2023-01-01",
          periodEnd: "2023-12-31",
          periodLabel: "FY2023",
        }),
        line("NET_PROFIT", "200", {
          periodStart: "2023-01-01",
          periodEnd: "2023-12-31",
          periodLabel: "FY2023",
        }),
        line("REVENUE", "1300"),
        line("NET_PROFIT", "130"),
        line("CURRENT_ASSETS", "500"),
        line("CURRENT_LIABILITIES", "200"),
        line("INVENTORY", "40"),
        line("TOTAL_ASSETS", "900"),
        line("TOTAL_LIABILITIES", "300"),
        line("EQUITY", "600"),
        line("OPERATING_CASH_FLOW", "100"),
      ],
    });
    const s = summarize("margin-down", snap);
    expect(s.findings).toContain("REV_UP_MARGIN_DOWN");
    expect(byCode(s.result.metrics).REVENUE_GROWTH?.status).toBe("COMPUTED");
  });

  it("4 negative equity → D/E UNDEFINED; leverage may still use L/A", () => {
    const snap = buildSnapshot({
      currency: "USD",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      lines: [
        line("REVENUE", "500"),
        line("NET_PROFIT", "-20"),
        line("INTEREST_BEARING_DEBT", "200"),
        line("EQUITY", "-50"),
        line("TOTAL_ASSETS", "400"),
        line("TOTAL_LIABILITIES", "450"),
        line("CURRENT_ASSETS", "100"),
        line("CURRENT_LIABILITIES", "150"),
        line("INVENTORY", "20"),
        line("OPERATING_CASH_FLOW", "-10"),
      ],
    });
    const s = summarize("neg-equity", snap);
    expect(byCode(s.result.metrics).DEBT_TO_EQUITY?.status).toBe("UNDEFINED");
    expect(byCode(s.result.metrics).LIABILITIES_TO_ASSETS?.status).toBe("COMPUTED");
    expect(s.findings).toContain("CA_LT_CL");
  });

  it("5 persistent losses across comparable years", () => {
    const snap = buildSnapshot({
      currency: "USD",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      lines: [
        line("NET_PROFIT", "-40", {
          periodStart: "2023-01-01",
          periodEnd: "2023-12-31",
          periodLabel: "FY2023",
        }),
        line("NET_PROFIT", "-55"),
        line("REVENUE", "200"),
        line("CURRENT_ASSETS", "80"),
        line("CURRENT_LIABILITIES", "90"),
        line("TOTAL_ASSETS", "200"),
        line("TOTAL_LIABILITIES", "150"),
        line("EQUITY", "50"),
      ],
    });
    const s = summarize("losses", snap);
    expect(s.findings).toContain("PERSISTENT_LOSSES");
  });

  it("6 income statement only → INSUFFICIENT_DATA / weak coverage", () => {
    const snap = buildSnapshot({
      currency: "USD",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      lines: [
        line("REVENUE", "1000"),
        line("GROSS_PROFIT", "400"),
        line("OPERATING_PROFIT", "200"),
        line("NET_PROFIT", "100"),
        line("OPERATING_EXPENSES", "200"),
        line("COST_OF_GOODS_SOLD", "600"),
      ],
    });
    const s = summarize("is-only", snap);
    expect(s.scoreStatus).toBe("INSUFFICIENT_DATA");
    expect(s.findings).toContain("WEAK_COVERAGE");
    expect(s.dims.length).toBeLessThan(3);
  });

  it("7 contradictory figures → consistency gate suppresses score", () => {
    const snap = buildSnapshot({
      currency: "USD",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      lines: [
        line("REVENUE", "1000"),
        line("REVENUE", "1500", { lineItemId: "00000000-0000-4000-8000-00000000aaaa" }),
        line("NET_PROFIT", "100"),
        line("CURRENT_ASSETS", "500"),
        line("CURRENT_LIABILITIES", "200"),
        line("INVENTORY", "50"),
        line("TOTAL_ASSETS", "900"),
        line("TOTAL_LIABILITIES", "300"),
        line("EQUITY", "600"),
        line("OPERATING_CASH_FLOW", "120"),
        line("COST_OF_GOODS_SOLD", "400"),
        line("GROSS_PROFIT", "100"), // inconsistent with 1000-400
      ],
    });
    const s = summarize("contradictory", snap);
    // Revenue conflict blocks growth/margins that need revenue; GP reconciliation fails
    expect(Number(s.consistency)).toBeLessThan(0.7);
    expect(s.scoreStatus).toBe("INSUFFICIENT_DATA");
  });

  it("8 multiple currencies → no authoritative mixed score", () => {
    const snap = buildSnapshot({
      lines: [
        line("REVENUE", "1000", { currency: "USD" }),
        line("NET_PROFIT", "100", { currency: "EUR" }),
        line("CURRENT_ASSETS", "500", { currency: "USD" }),
        line("CURRENT_LIABILITIES", "200", { currency: "EUR" }),
      ],
    });
    const s = summarize("multi-fx", snap);
    expect(s.scoreStatus).toBe("INSUFFICIENT_DATA");
    expect(byCode(s.result.metrics).NET_MARGIN?.status).toBe("INCOMPATIBLE");
  });

  it("9 incomplete periods → growth INCOMPATIBLE or INSUFFICIENT", () => {
    const snap = buildSnapshot({
      currency: "USD",
      lines: [
        line("REVENUE", "100", { periodStart: null, periodEnd: null, periodLabel: "Prior" }),
        line("REVENUE", "120", { periodStart: null, periodEnd: null, periodLabel: "Current" }),
        line("NET_PROFIT", "10"),
      ],
    });
    const growth = byCode(computeMetrics(snap)).REVENUE_GROWTH;
    expect(["INCOMPATIBLE", "INSUFFICIENT_INPUTS"]).toContain(growth?.status);
  });

  it("10 unreviewed evidence → reliability suppresses overall score", () => {
    const snap = buildSnapshot({
      currency: "USD",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      lines: [
        line("REVENUE", "1000", { reviewStatus: "PENDING", quality: "LOW" }),
        line("NET_PROFIT", "200", { reviewStatus: "PENDING", quality: "LOW" }),
        line("OPERATING_PROFIT", "250", { reviewStatus: "PENDING", quality: "LOW" }),
        line("CURRENT_ASSETS", "500", { reviewStatus: "PENDING", quality: "LOW" }),
        line("CURRENT_LIABILITIES", "200", { reviewStatus: "PENDING", quality: "LOW" }),
        line("INVENTORY", "50", { reviewStatus: "PENDING", quality: "LOW" }),
        line("TOTAL_ASSETS", "900", { reviewStatus: "PENDING", quality: "LOW" }),
        line("TOTAL_LIABILITIES", "300", { reviewStatus: "PENDING", quality: "LOW" }),
        line("EQUITY", "600", { reviewStatus: "PENDING", quality: "LOW" }),
        line("OPERATING_CASH_FLOW", "180", { reviewStatus: "PENDING", quality: "LOW" }),
      ],
    });
    const s = summarize("unreviewed", snap);
    expect(Number(s.reliability)).toBeLessThan(0.5);
    expect(s.scoreStatus).toBe("INSUFFICIENT_DATA");
  });

  it("score is deterministic across repeated runs", () => {
    const snap = healthySnapshot();
    const a = runDiagnosticEngine(snap);
    const b = runDiagnosticEngine(snap);
    expect(a.score).toEqual(b.score);
    expect(a.metrics).toEqual(b.metrics);
    expect(a.findings.map((f) => f.ruleId)).toEqual(b.findings.map((f) => f.ruleId));
  });
});

describe("acceptance audit — findings rules", () => {
  it("triggers and non-triggers for each rules.v1 rule", () => {
    // OCF_NEG_NI_POS positive
    expect(
      runDiagnosticEngine(
        buildSnapshot({
          currency: "USD",
          lines: [line("NET_PROFIT", "10"), line("OPERATING_CASH_FLOW", "-5")],
        }),
      ).findings.some((f) => f.ruleId === "OCF_NEG_NI_POS"),
    ).toBe(true);

    // OCF_NEG_NI_POS non-trigger
    expect(
      runDiagnosticEngine(
        buildSnapshot({
          currency: "USD",
          lines: [line("NET_PROFIT", "10"), line("OPERATING_CASH_FLOW", "5")],
        }),
      ).findings.some((f) => f.ruleId === "OCF_NEG_NI_POS"),
    ).toBe(false);

    // CA_LT_CL positive / non-trigger
    expect(
      runDiagnosticEngine(
        buildSnapshot({
          currency: "USD",
          lines: [line("CURRENT_ASSETS", "10"), line("CURRENT_LIABILITIES", "20")],
        }),
      ).findings.some((f) => f.ruleId === "CA_LT_CL"),
    ).toBe(true);
    expect(
      runDiagnosticEngine(
        buildSnapshot({
          currency: "USD",
          lines: [line("CURRENT_ASSETS", "30"), line("CURRENT_LIABILITIES", "20")],
        }),
      ).findings.some((f) => f.ruleId === "CA_LT_CL"),
    ).toBe(false);

    // WEAK_COVERAGE
    expect(
      runDiagnosticEngine(
        buildSnapshot({ currency: "USD", lines: [line("REVENUE", "1")] }),
      ).findings.some((f) => f.ruleId === "WEAK_COVERAGE"),
    ).toBe(true);

    // Wording never claims fraud / proves insolvency
    const distressed = runDiagnosticEngine(
      buildSnapshot({
        currency: "USD",
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        lines: [
          line("NET_PROFIT", "-10", {
            periodStart: "2023-01-01",
            periodEnd: "2023-12-31",
            periodLabel: "FY2023",
          }),
          line("NET_PROFIT", "-20"),
          line("CURRENT_ASSETS", "5"),
          line("CURRENT_LIABILITIES", "50"),
          line("OPERATING_CASH_FLOW", "-30"),
          line("REVENUE", "100"),
        ],
      }),
    );
    for (const f of distressed.findings) {
      expect(f.explanation.toLowerCase()).not.toContain("fraud");
      expect(f.implication.toLowerCase()).not.toMatch(/proves insolvency|financial misconduct/);
      expect(f.evidence.every((e) => e.snapshotKey.length > 0 || f.ruleId === "WEAK_COVERAGE")).toBe(
        true,
      );
    }
  });
});
