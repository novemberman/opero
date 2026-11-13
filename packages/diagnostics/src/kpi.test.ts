import { describe, expect, it } from "vitest";
import { computeMetrics } from "./kpi.js";
import { buildSnapshot } from "./snapshot.js";
import { distressedSnapshot, healthySnapshot, incompleteSnapshot, line } from "./test-fixtures.js";

describe("KPI engine", () => {
  it("computes healthy ratios with independent expectations", () => {
    const metrics = computeMetrics(healthySnapshot());
    const byCode = Object.fromEntries(metrics.map((m) => [m.code, m]));

    expect(byCode.GROSS_MARGIN?.status).toBe("COMPUTED");
    expect(byCode.GROSS_MARGIN?.value).toBe("0.6"); // 720/1200
    expect(byCode.NET_MARGIN?.value).toBe("0.25"); // 300/1200
    expect(byCode.CURRENT_RATIO?.value).toBe("2"); // 500/250
    expect(byCode.QUICK_RATIO?.value).toBe("1.52"); // (500-120)/250
    expect(byCode.WORKING_CAPITAL?.value).toBe("250");
    expect(Number(byCode.DEBT_TO_EQUITY?.value)).toBeCloseTo(1 / 3, 10);
    expect(byCode.FREE_CASH_FLOW?.value).toBe("300"); // 350-50
    expect(byCode.REVENUE_GROWTH?.value).toBe("0.2"); // (1200-1000)/1000
  });

  it("does not treat missing inventory as zero for quick ratio", () => {
    const snap = buildSnapshot({
      currency: "USD",
      lines: [line("CURRENT_ASSETS", "100"), line("CURRENT_LIABILITIES", "50")],
    });
    const quick = computeMetrics(snap).find((m) => m.code === "QUICK_RATIO");
    expect(quick?.status).toBe("INSUFFICIENT_INPUTS");
  });

  it("does not use total liabilities as debt-to-equity", () => {
    const snap = buildSnapshot({
      currency: "USD",
      lines: [
        line("TOTAL_LIABILITIES", "400"),
        line("EQUITY", "200"),
      ],
    });
    const de = computeMetrics(snap).find((m) => m.code === "DEBT_TO_EQUITY");
    expect(de?.status).toBe("INSUFFICIENT_INPUTS");
  });

  it("marks zero denominators UNDEFINED", () => {
    const snap = buildSnapshot({
      currency: "USD",
      lines: [line("NET_PROFIT", "10"), line("REVENUE", "0")],
    });
    const net = computeMetrics(snap).find((m) => m.code === "NET_MARGIN");
    expect(net?.status).toBe("UNDEFINED");
  });

  it("distinguishes missing from zero", () => {
    const snap = buildSnapshot({
      currency: "USD",
      lines: [line("REVENUE", "100")],
    });
    const ocf = computeMetrics(snap).find((m) => m.code === "OCF_MARGIN");
    expect(ocf?.status).toBe("INSUFFICIENT_INPUTS");
    expect(ocf?.value).toBeNull();
  });

  it("rejects currency mismatches as INCOMPATIBLE", () => {
    const snap = buildSnapshot({
      currency: "USD",
      lines: [
        line("REVENUE", "100", { currency: "USD" }),
        line("NET_PROFIT", "10", { currency: "EUR" }),
      ],
    });
    const net = computeMetrics(snap).find((m) => m.code === "NET_MARGIN");
    expect(net?.status).toBe("INCOMPATIBLE");
  });

  it("handles distressed negatives without inventing values", () => {
    const metrics = computeMetrics(distressedSnapshot());
    const wc = metrics.find((m) => m.code === "WORKING_CAPITAL");
    expect(wc?.value).toBe("-150");
    const fcf = metrics.find((m) => m.code === "FREE_CASH_FLOW");
    expect(fcf?.status).toBe("INSUFFICIENT_INPUTS");
  });

  it("leaves incomplete sets mostly uncomputed", () => {
    const metrics = computeMetrics(incompleteSnapshot());
    const computed = metrics.filter((m) => m.status === "COMPUTED");
    expect(computed.length).toBe(0);
  });

  it("applies unit scale into actual values", () => {
    const snap = buildSnapshot({
      currency: "USD",
      lines: [
        line("REVENUE", "1.2", { unitScale: "THOUSANDS" }),
        line("NET_PROFIT", "0.3", { unitScale: "THOUSANDS" }),
      ],
    });
    const net = computeMetrics(snap).find((m) => m.code === "NET_MARGIN");
    expect(net?.status).toBe("COMPUTED");
    expect(net?.value).toBe("0.25");
  });
});
