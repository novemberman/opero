import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAiContext } from "../context.js";
import { checkClaimGrounding } from "../grounding.js";
import { PROMPT_VERSION } from "../prompt.js";
import { aiNarrativeSchema } from "../schema.js";
import { factsFixture, FINDING_COVERAGE_ID, FINDING_LIQUIDITY_ID } from "../test-fixtures.js";
import { MOCK_AI_MODEL, MockAiProvider, SIMULATED_NOTICE } from "./mock.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MockAiProvider", () => {
  it("labels its result as simulated", async () => {
    const result = await new MockAiProvider().interpret(buildAiContext(factsFixture()));

    expect(result.isSimulated).toBe(true);
    expect(result.provider).toBe("mock");
    expect(result.model).toBe(MOCK_AI_MODEL);
    expect(result.promptVersion).toBe(PROMPT_VERSION);
    expect(result.narrative.summary).toContain(SIMULATED_NOTICE);
    expect(result.narrative.limitations[0]).toBe(SIMULATED_NOTICE);
  });

  it("is deterministic for the same context", async () => {
    const provider = new MockAiProvider();

    const first = await provider.interpret(buildAiContext(factsFixture()));
    const second = await provider.interpret(buildAiContext(factsFixture()));
    const other = await new MockAiProvider().interpret(buildAiContext(factsFixture()));

    expect(second).toEqual(first);
    expect(other).toEqual(first);
  });

  it("never touches the network", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("network access is not allowed in tests");
    });
    vi.stubGlobal("fetch", fetchSpy);

    await new MockAiProvider().interpret(buildAiContext(factsFixture()));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("produces a narrative that satisfies the output schema", async () => {
    const result = await new MockAiProvider().interpret(buildAiContext(factsFixture()));

    expect(aiNarrativeSchema.safeParse(result.narrative).success).toBe(true);
  });

  it("restates computed metrics and the score exactly as given", async () => {
    const { narrative } = await new MockAiProvider().interpret(buildAiContext(factsFixture()));

    expect(narrative.summary).toContain("The overall score is 54 out of 100.");
    expect(narrative.summary).toContain("3 of 4 metrics were computed and 2 findings were raised.");
    expect(narrative.keyObservations).toEqual([
      "Current ratio [CURRENT_RATIO] was computed as 0.82 (ratio).",
      "Net margin [NET_MARGIN] was computed as 0.071 (ratio).",
      "Working capital [WORKING_CAPITAL] was computed as -18000 (currency).",
    ]);
  });

  it("reports metrics without a value as limitations, never as observations", async () => {
    const { narrative } = await new MockAiProvider().interpret(buildAiContext(factsFixture()));

    expect(narrative.keyObservations.join(" ")).not.toContain("DEBT_TO_EQUITY");
    expect(narrative.limitations).toContain("1 metrics have no computed value: DEBT_TO_EQUITY.");
    expect(narrative.limitations).toContain("Debt to equity could not be computed");
  });

  it("lists risk findings and leaves low-severity data-quality findings out of risks", async () => {
    const { narrative } = await new MockAiProvider().interpret(buildAiContext(factsFixture()));

    expect(narrative.risks).toEqual([
      "Current liabilities exceed current assets (HIGH): Current assets do not cover current liabilities for the period.",
    ]);
  });

  it("emits only claims grounded in the context", async () => {
    const context = buildAiContext(factsFixture());
    const result = await new MockAiProvider().interpret(context);

    const grounding = checkClaimGrounding(
      result,
      context.allowedMetricCodes,
      context.allowedFindingIds,
    );

    expect(grounding.unsupportedClaims).toEqual([]);
    expect(grounding.groundedClaims).toHaveLength(5);
    expect(result.narrative.claims[0]).toMatchObject({
      groundedMetricCodes: ["WORKING_CAPITAL", "CURRENT_RATIO"],
      groundedFindingIds: [FINDING_LIQUIDITY_ID],
    });
    expect(result.narrative.claims[1]).toMatchObject({
      groundedMetricCodes: [],
      groundedFindingIds: [FINDING_COVERAGE_ID],
    });
  });

  it("does not cite supporting metrics that are absent from the context", async () => {
    const facts = factsFixture();
    const context = buildAiContext({
      ...facts,
      metrics: facts.metrics.filter((metric) => metric.code !== "WORKING_CAPITAL"),
    });

    const result = await new MockAiProvider().interpret(context);

    expect(result.narrative.claims[0]?.groundedMetricCodes).toEqual(["CURRENT_RATIO"]);
    expect(
      checkClaimGrounding(result, context.allowedMetricCodes, context.allowedFindingIds)
        .unsupportedClaims,
    ).toEqual([]);
  });

  it("states that no score exists when data is insufficient", async () => {
    const context = buildAiContext({
      metrics: [],
      findings: [],
      quality: {},
      score: { status: "INSUFFICIENT_DATA", overallScore: null },
    });

    const { narrative } = await new MockAiProvider().interpret(context);

    expect(narrative.summary).toContain(
      "No overall score was produced (score status: INSUFFICIENT_DATA).",
    );
    expect(narrative.summary).not.toContain("out of 100");
    expect(narrative.keyObservations).toEqual([]);
    expect(narrative.risks).toEqual([]);
    expect(narrative.claims).toEqual([]);
  });

  it("stays within schema limits for very large contexts", async () => {
    const context = buildAiContext({
      ...factsFixture(),
      metrics: Array.from({ length: 100 }, (_, i) => ({
        code: `METRIC_${i}`,
        label: `Metric ${i}`,
        status: "COMPUTED",
        value: String(i),
      })),
    });

    const result = await new MockAiProvider().interpret(context);

    expect(aiNarrativeSchema.safeParse(result.narrative).success).toBe(true);
  });
});
