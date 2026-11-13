import { describe, expect, it } from "vitest";
import { runDiagnosticEngine } from "./engine.js";
import { healthySnapshot, incompleteSnapshot } from "./test-fixtures.js";
import { SCORE_METHODOLOGY_VERSION } from "./versions.js";

describe("score engine", () => {
  it("scores a healthy complete snapshot with score.v1", () => {
    const result = runDiagnosticEngine(healthySnapshot());
    expect(result.score.methodologyVersion).toBe(SCORE_METHODOLOGY_VERSION);
    expect(result.score.status).toBe("SCORED");
    expect(result.score.overallScore).toBeTypeOf("number");
    expect(result.score.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.score.overallScore).toBeLessThanOrEqual(100);
    expect(result.quality.diagnosticCoverage).not.toBe("0");
  });

  it("suppresses overall score for incomplete data", () => {
    const result = runDiagnosticEngine(incompleteSnapshot());
    expect(result.score.status).toBe("INSUFFICIENT_DATA");
    expect(result.score.overallScore).toBeNull();
    expect(result.findings.some((f) => f.ruleId === "WEAK_COVERAGE")).toBe(true);
  });

  it("is reproducible for the same snapshot", () => {
    const snap = healthySnapshot();
    const a = runDiagnosticEngine(snap);
    const b = runDiagnosticEngine(snap);
    expect(a.score).toEqual(b.score);
    expect(a.metrics.map((m) => [m.code, m.status, m.value])).toEqual(
      b.metrics.map((m) => [m.code, m.status, m.value]),
    );
  });

  it("does not renormalize missing dimensions to full weight", () => {
    const result = runDiagnosticEngine(healthySnapshot());
    const includedWeight = result.score.components
      .filter((c) => c.included)
      .reduce((acc, c) => acc + c.weight, 0);
    expect(includedWeight).toBeLessThanOrEqual(100);
    // overall uses /100 of original weights, so max < 100 if any excluded
    const excluded = result.score.components.filter((c) => !c.included);
    if (excluded.length && result.score.overallScore != null) {
      expect(result.score.overallScore).toBeLessThanOrEqual(includedWeight);
    }
  });
});
