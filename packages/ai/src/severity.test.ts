import { describe, expect, it } from "vitest";
import { buildAiContext } from "./context.js";
import { checkNarrativeGrounding } from "./grounding.js";
import {
  GROUNDING_VALIDATION_VERSION,
  classifyGroundingResult,
  groundingAllowsPublication,
  severityForUnsupportedClaim,
} from "./severity.js";
import { factsFixture, narrativeFixture } from "./test-fixtures.js";

describe("severityForUnsupportedClaim", () => {
  it("marks unsupported and contradictory numbers as critical", () => {
    expect(
      severityForUnsupportedClaim({
        text: "Revenue is 999",
        groundedMetricCodes: ["REVENUE"],
        groundedFindingIds: [],
        reasons: ["UNSUPPORTED_NUMBER"],
        unknownMetricCodes: [],
        unknownFindingIds: [],
        unsupportedNumbers: ["999"],
      }),
    ).toBe("CRITICAL");
    expect(
      severityForUnsupportedClaim({
        text: "Revenue is 999",
        groundedMetricCodes: ["REVENUE"],
        groundedFindingIds: [],
        reasons: ["UNSUPPORTED_NUMBER", "CONTRADICTORY_NUMBER"],
        unknownMetricCodes: [],
        unknownFindingIds: [],
      }),
    ).toBe("CRITICAL");
  });

  it("marks restricted assurance language as critical", () => {
    expect(
      severityForUnsupportedClaim({
        text: "This is an audit opinion",
        groundedMetricCodes: [],
        groundedFindingIds: [],
        reasons: ["RESTRICTED_LANGUAGE"],
        unknownMetricCodes: [],
        unknownFindingIds: [],
        restrictedTerms: ["audit"],
      }),
    ).toBe("CRITICAL");
  });

  it("marks numeric claims without evidence as critical outside limitations", () => {
    expect(
      severityForUnsupportedClaim({
        text: "Cash is 42",
        groundedMetricCodes: [],
        groundedFindingIds: [],
        reasons: ["NO_REFERENCES"],
        unknownMetricCodes: [],
        unknownFindingIds: [],
      }),
    ).toBe("CRITICAL");
  });
});

describe("classifyGroundingResult", () => {
  it("fails when critical quantitative violations are present", () => {
    const context = buildAiContext(factsFixture());
    const narrative = narrativeFixture({
      claims: [
        {
          text: "Net margin is 99.9 which is excellent",
          groundedMetricCodes: ["NET_MARGIN"],
          groundedFindingIds: [],
        },
      ],
    });
    const classified = classifyGroundingResult(checkNarrativeGrounding(narrative, context));
    expect(classified.version).toBe(GROUNDING_VALIDATION_VERSION);
    expect(classified.passed).toBe(false);
    expect(groundingAllowsPublication(classified)).toBe(false);
    expect(classified.criticalViolations.length).toBeGreaterThan(0);
    expect(
      classified.criticalViolations.some((v) => v.reasons.includes("UNSUPPORTED_NUMBER")),
    ).toBe(true);
    expect(
      classified.criticalViolations.some((v) => v.reasons.includes("CONTRADICTORY_NUMBER")),
    ).toBe(true);
  });

  it("passes a clean grounded narrative", () => {
    const context = buildAiContext(factsFixture());
    const narrative = narrativeFixture();
    const classified = classifyGroundingResult(checkNarrativeGrounding(narrative, context));
    expect(classified.passed).toBe(true);
    expect(classified.criticalViolations).toEqual([]);
  });
});
