import { describe, expect, it } from "vitest";
import { buildAiContext } from "./context.js";
import { checkClaimGrounding } from "./grounding.js";
import type { AiClaim } from "./schema.js";
import {
  factsFixture,
  FINDING_COVERAGE_ID,
  FINDING_LIQUIDITY_ID,
  narrativeFixture,
} from "./test-fixtures.js";
import type { AiInterpretationResult } from "./types.js";

const METRICS = ["CURRENT_RATIO", "NET_MARGIN", "WORKING_CAPITAL"];
const FINDINGS = [FINDING_LIQUIDITY_ID, FINDING_COVERAGE_ID];

function claim(text: string, metrics: string[] = [], findings: string[] = []): AiClaim {
  return { text, groundedMetricCodes: metrics, groundedFindingIds: findings };
}

function check(claims: AiClaim[]) {
  return checkClaimGrounding(narrativeFixture({ claims }), METRICS, FINDINGS);
}

describe("checkClaimGrounding", () => {
  it("accepts claims whose references are all allowed", () => {
    const claims = [
      claim("The current ratio is 0.82.", ["CURRENT_RATIO"]),
      claim("Current liabilities exceed current assets.", [], [FINDING_LIQUIDITY_ID]),
      claim("Liquidity is weak.", ["CURRENT_RATIO", "WORKING_CAPITAL"], [FINDING_LIQUIDITY_ID]),
    ];

    const result = check(claims);

    expect(result.groundedClaims).toEqual(claims);
    expect(result.unsupportedClaims).toEqual([]);
  });

  it("rejects a claim that cites no facts", () => {
    const result = check([claim("Revenue will double next year.")]);

    expect(result.groundedClaims).toEqual([]);
    expect(result.unsupportedClaims).toEqual([
      {
        text: "Revenue will double next year.",
        groundedMetricCodes: [],
        groundedFindingIds: [],
        reasons: ["NO_REFERENCES"],
        unknownMetricCodes: [],
        unknownFindingIds: [],
      },
    ]);
  });

  it("rejects a claim citing an invented KPI", () => {
    const result = check([claim("EBITDA margin is 31%.", ["EBITDA_MARGIN"])]);

    expect(result.groundedClaims).toEqual([]);
    expect(result.unsupportedClaims[0]).toMatchObject({
      reasons: ["UNKNOWN_METRIC_CODE"],
      unknownMetricCodes: ["EBITDA_MARGIN"],
      unknownFindingIds: [],
    });
  });

  it("rejects a claim citing an unknown finding id", () => {
    const result = check([claim("Fraud was detected.", [], ["finding-does-not-exist"])]);

    expect(result.groundedClaims).toEqual([]);
    expect(result.unsupportedClaims[0]).toMatchObject({
      reasons: ["UNKNOWN_FINDING_ID"],
      unknownFindingIds: ["finding-does-not-exist"],
    });
  });

  it("rejects a claim that mixes valid and invented references", () => {
    const result = check([
      claim("Margins beat the industry.", ["NET_MARGIN", "INDUSTRY_BENCHMARK"], ["made-up"]),
    ]);

    expect(result.groundedClaims).toEqual([]);
    expect(result.unsupportedClaims[0]).toMatchObject({
      reasons: ["UNKNOWN_METRIC_CODE", "UNKNOWN_FINDING_ID"],
      unknownMetricCodes: ["INDUSTRY_BENCHMARK"],
      unknownFindingIds: ["made-up"],
    });
  });

  it("does not match codes case-insensitively or across kinds", () => {
    const result = check([
      claim("Lower-case code.", ["current_ratio"]),
      claim("Metric code used as a finding id.", [], ["CURRENT_RATIO"]),
      claim("Finding id used as a metric code.", [FINDING_LIQUIDITY_ID]),
    ]);

    expect(result.groundedClaims).toEqual([]);
    expect(result.unsupportedClaims).toHaveLength(3);
  });

  it("treats blank references as no reference", () => {
    const result = check([claim("Padding.", ["  "], [""])]);

    expect(result.unsupportedClaims[0]?.reasons).toEqual(["NO_REFERENCES"]);
  });

  it("separates grounded from unsupported claims and keeps their order", () => {
    const result = check([
      claim("A", ["CURRENT_RATIO"]),
      claim("B", ["INVENTED"]),
      claim("C", [], [FINDING_COVERAGE_ID]),
      claim("D"),
    ]);

    expect(result.groundedClaims.map((c) => c.text)).toEqual(["A", "C"]);
    expect(result.unsupportedClaims.map((c) => c.text)).toEqual(["B", "D"]);
  });

  it("rejects every claim when nothing is allowed", () => {
    const result = checkClaimGrounding(narrativeFixture(), [], []);

    expect(result.groundedClaims).toEqual([]);
    expect(result.unsupportedClaims).toHaveLength(2);
  });

  it("accepts a provider result and the allowed lists from a context", () => {
    const context = buildAiContext(factsFixture());
    const providerResult: AiInterpretationResult = {
      narrative: narrativeFixture(),
      provider: "mock",
      model: null,
      promptVersion: "ai.interpret.v1",
      isSimulated: true,
    };

    const result = checkClaimGrounding(
      providerResult,
      context.allowedMetricCodes,
      new Set(context.allowedFindingIds),
    );

    expect(result.groundedClaims).toHaveLength(2);
    expect(result.unsupportedClaims).toEqual([]);
  });
});
