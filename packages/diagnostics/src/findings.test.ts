import { describe, expect, it } from "vitest";
import { runDiagnosticEngine } from "./engine.js";
import { buildSnapshot } from "./snapshot.js";
import { distressedSnapshot, line } from "./test-fixtures.js";

describe("findings rules", () => {
  it("flags negative OCF with positive NI", () => {
    const snap = buildSnapshot({
      currency: "USD",
      lines: [
        line("NET_PROFIT", "50"),
        line("OPERATING_CASH_FLOW", "-20"),
        line("REVENUE", "200"),
        line("CURRENT_ASSETS", "100"),
        line("CURRENT_LIABILITIES", "40"),
      ],
    });
    const result = runDiagnosticEngine(snap);
    expect(result.findings.some((f) => f.ruleId === "OCF_NEG_NI_POS")).toBe(true);
  });

  it("flags CA < CL", () => {
    const result = runDiagnosticEngine(distressedSnapshot());
    expect(result.findings.some((f) => f.ruleId === "CA_LT_CL")).toBe(true);
    expect(result.findings.some((f) => f.ruleId === "PERSISTENT_LOSSES")).toBe(true);
  });

  it("does not claim fraud in explanations", () => {
    const result = runDiagnosticEngine(distressedSnapshot());
    for (const finding of result.findings) {
      expect(finding.explanation.toLowerCase()).not.toContain("fraud");
      expect(finding.implication.toLowerCase()).not.toMatch(/proves insolvency/);
    }
  });

  it("attaches evidence provenance keys when available", () => {
    const snap = buildSnapshot({
      currency: "USD",
      lines: [
        line("CURRENT_ASSETS", "10", { evidenceReferenceId: "00000000-0000-4000-8000-0000000000aa" }),
        line("CURRENT_LIABILITIES", "20"),
      ],
    });
    const result = runDiagnosticEngine(snap);
    const finding = result.findings.find((f) => f.ruleId === "CA_LT_CL");
    expect(finding?.evidence.length).toBeGreaterThan(0);
    expect(finding?.evidence[0]?.snapshotKey).toContain("CURRENT_ASSETS");
  });
});
