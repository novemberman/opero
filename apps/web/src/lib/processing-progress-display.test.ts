import { describe, expect, it } from "vitest";
import { resolveProgressDisplay } from "./processing-progress-display";

describe("processing-progress-display", () => {
  it("shows numeric progress only when the backend supplies a percentage", () => {
    const result = resolveProgressDisplay({
      progressPercent: 55,
      currentStage: "IDENTIFYING_FIGURES",
      stages: [
        {
          id: "IDENTIFYING_FIGURES",
          label: "Identifying figures",
          status: "RUNNING",
          startedAt: null,
          completedAt: null,
        },
      ],
    });
    expect(result.mode).toBe("percent");
    expect(result.percent).toBe(55);
    expect(result.label).toBe("55% complete");
  });

  it("falls back to stage-based progress without inventing a number", () => {
    const result = resolveProgressDisplay({
      progressPercent: null,
      currentStage: "SECURITY_SCANNING",
      stages: [
        {
          id: "SECURITY_SCANNING",
          label: "Security scanning",
          status: "RUNNING",
          startedAt: null,
          completedAt: null,
        },
      ],
    });
    expect(result.mode).toBe("stage");
    expect(result.percent).toBeNull();
    expect(result.label).toMatch(/stage progress/i);
    expect(result.label).toMatch(/security scanning/i);
  });
});
