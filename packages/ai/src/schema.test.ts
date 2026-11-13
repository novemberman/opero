import { describe, expect, it } from "vitest";
import {
  AI_OUTPUT_LIMITS,
  aiNarrativeSchema,
  AiOutputValidationError,
  parseAiNarrative,
  parseAiNarrativeJson,
} from "./schema.js";
import { narrativeFixture } from "./test-fixtures.js";

describe("aiNarrativeSchema", () => {
  it("accepts a well-formed narrative unchanged", () => {
    const narrative = narrativeFixture();

    expect(parseAiNarrative(narrative)).toEqual(narrative);
  });

  it("drops unknown keys instead of passing them through", () => {
    const parsed = parseAiNarrative({
      ...narrativeFixture(),
      projectedRevenue: "12,000,000",
      claims: [
        {
          text: "The current ratio is 0.82.",
          groundedMetricCodes: ["CURRENT_RATIO"],
          groundedFindingIds: [],
          confidence: 0.99,
        },
      ],
    });

    expect(parsed).not.toHaveProperty("projectedRevenue");
    expect(parsed.claims[0]).not.toHaveProperty("confidence");
  });

  it("treats missing claim references as empty so grounding can reject them", () => {
    const parsed = parseAiNarrative({
      ...narrativeFixture(),
      claims: [{ text: "Revenue will double next year." }],
    });

    expect(parsed.claims).toEqual([
      { text: "Revenue will double next year.", groundedMetricCodes: [], groundedFindingIds: [] },
    ]);
  });

  it.each([
    ["missing summary", { ...narrativeFixture(), summary: undefined }],
    ["blank summary", { ...narrativeFixture(), summary: "   " }],
    ["missing keyObservations", { ...narrativeFixture(), keyObservations: undefined }],
    ["risks not an array", { ...narrativeFixture(), risks: "none" }],
    ["non-string limitation", { ...narrativeFixture(), limitations: [42] }],
    ["missing claims", { ...narrativeFixture(), claims: undefined }],
    ["claim without text", { ...narrativeFixture(), claims: [{ groundedMetricCodes: ["X"] }] }],
    [
      "claim references not strings",
      { ...narrativeFixture(), claims: [{ text: "x", groundedMetricCodes: [1] }] },
    ],
    [
      "summary over the size limit",
      { ...narrativeFixture(), summary: "x".repeat(AI_OUTPUT_LIMITS.summaryChars + 1) },
    ],
    ["not an object", "just prose"],
    ["null", null],
  ])("rejects %s", (_name, value) => {
    expect(aiNarrativeSchema.safeParse(value).success).toBe(false);
    expect(() => parseAiNarrative(value)).toThrow(AiOutputValidationError);
  });

  it("reports which fields failed", () => {
    try {
      parseAiNarrative({ ...narrativeFixture(), summary: "", claims: [{ text: "" }] });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AiOutputValidationError);
      const paths = (error as AiOutputValidationError).issues.map((i) => i.split(":")[0]);
      expect(paths).toEqual(expect.arrayContaining(["summary", "claims.0.text"]));
    }
  });
});

describe("parseAiNarrativeJson", () => {
  it("parses plain JSON text", () => {
    const narrative = narrativeFixture();

    expect(parseAiNarrativeJson(JSON.stringify(narrative))).toEqual(narrative);
  });

  it("parses JSON wrapped in a Markdown code fence", () => {
    const narrative = narrativeFixture();
    const fenced = "```json\n" + JSON.stringify(narrative, null, 2) + "\n```";

    expect(parseAiNarrativeJson(fenced)).toEqual(narrative);
  });

  it.each([
    ["prose", "Here is my analysis: the company is doing well."],
    ["truncated JSON", '{"summary": "cut off'],
    ["empty text", ""],
    ["a JSON array", "[]"],
  ])("rejects %s", (_name, text) => {
    expect(() => parseAiNarrativeJson(text)).toThrow(AiOutputValidationError);
  });
});
