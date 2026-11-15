import { describe, expect, it } from "vitest";
import { resolveHealthScorePresentation } from "./health-score-presentation";

describe("health-score-presentation", () => {
  it("shows the score only when the backend declares SCORED eligibility", () => {
    const result = resolveHealthScorePresentation({
      runStatus: "SUCCEEDED",
      score: {
        status: "SCORED",
        overallScore: 72,
        components: [
          {
            dimension: "profitability",
            weight: 25,
            included: true,
            score: 80,
            exclusionReason: null,
          },
        ],
      },
    });
    expect(result.kind).toBe("scored");
    expect(result.scoreText).toBe("72");
    expect(result.badgeLabel).toBe("Eligible");
  });

  it("withholds the score for INSUFFICIENT_DATA without inventing a figure", () => {
    const result = resolveHealthScorePresentation({
      runStatus: "SUCCEEDED",
      score: {
        status: "INSUFFICIENT_DATA",
        overallScore: null,
        limitations: ["coverage below threshold"],
        components: [],
      },
    });
    expect(result.kind).toBe("withheld");
    expect(result.scoreText).toBeNull();
    expect(result.badgeLabel).toMatch(/insufficient/i);
    expect(result.limitations).toContain("coverage below threshold");
  });

  it("marks pending runs before completion", () => {
    const result = resolveHealthScorePresentation({
      runStatus: "RUNNING",
      score: null,
    });
    expect(result.kind).toBe("pending");
    expect(result.scoreText).toBeNull();
  });

  it("marks missing score payloads as unavailable", () => {
    const result = resolveHealthScorePresentation({
      runStatus: "SUCCEEDED",
      score: null,
    });
    expect(result.kind).toBe("unavailable");
    expect(result.scoreText).toBeNull();
  });
});
