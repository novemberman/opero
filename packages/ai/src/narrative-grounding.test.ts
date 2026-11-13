import { describe, expect, it } from "vitest";
import { buildAiContext } from "./context.js";
import { checkNarrativeGrounding } from "./grounding.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { MockAiProvider } from "./providers/mock.js";
import type { AiClaim, AiNarrative } from "./schema.js";
import {
  factsFixture,
  FINDING_COVERAGE_ID,
  FINDING_LIQUIDITY_ID,
  narrativeFixture,
} from "./test-fixtures.js";

const SCORE_DISCLAIMER =
  "This score is not a credit rating, audit opinion, or prediction of business survival";

/** The statement quotes a figure that none of the facts it may rest on contains. */
const INVENTED = ["UNSUPPORTED_NUMBER"];
/** The same, in a claim whose references all resolve and include a computed metric. */
const CONTRADICTS = ["UNSUPPORTED_NUMBER", "CONTRADICTORY_NUMBER"];

function claim(text: string, metrics: string[] = [], findings: string[] = []): AiClaim {
  return { text, groundedMetricCodes: metrics, groundedFindingIds: findings };
}

function check(overrides: Partial<AiNarrative>, facts = factsFixture()) {
  return checkNarrativeGrounding(narrativeFixture(overrides), buildAiContext(facts));
}

function checkClaims(claims: AiClaim[]) {
  return check({ claims });
}

describe("checkNarrativeGrounding: figures in claims", () => {
  it("accepts figures taken from the facts a claim cites", () => {
    const claims = [
      claim("The current ratio is 0.82.", ["CURRENT_RATIO"]),
      claim("Working capital is -18,000 USD.", ["WORKING_CAPITAL"]),
      claim("Working capital is negative at 18000.00.", ["WORKING_CAPITAL"]),
      claim("Net margin [NET_MARGIN] was computed as 0.071 (ratio) for FY2025.", ["NET_MARGIN"]),
      claim("Current liabilities exceed current assets.", [], [FINDING_LIQUIDITY_ID]),
    ];

    const result = checkClaims(claims);

    expect(result.unsupportedClaims).toEqual([]);
    expect(result.groundedClaims).toEqual(claims);
  });

  it("flags an invented figure even when the cited metric exists", () => {
    const result = checkClaims([claim("The current ratio is 1.9.", ["CURRENT_RATIO"])]);

    expect(result.groundedClaims).toEqual([]);
    expect(result.unsupportedClaims).toEqual([
      {
        text: "The current ratio is 1.9.",
        groundedMetricCodes: ["CURRENT_RATIO"],
        groundedFindingIds: [],
        reasons: CONTRADICTS,
        unknownMetricCodes: [],
        unknownFindingIds: [],
        unsupportedNumbers: ["1.9"],
      },
    ]);
  });

  it.each([
    ["a recomputed percentage", "Net margin is 7.1%.", ["NET_MARGIN"], ["7.1"]],
    ["an invented growth rate", "Revenue grew 500% year on year.", ["NET_MARGIN"], ["500"]],
    ["an extrapolated forecast", "Net margin will reach 0.12 in 2027.", ["NET_MARGIN"], ["0.12", "2027"]],
    ["an invented benchmark", "Net margin of 0.071 beats the 0.05 industry median.", ["NET_MARGIN"], ["0.05"]],
    ["a derived amount", "Working capital is short by 18,500.", ["WORKING_CAPITAL"], ["18,500"]],
    ["a wrongly scaled amount", "Working capital is -18 million.", ["WORKING_CAPITAL"], ["18"]],
    ["rounding to a round amount", "Working capital is roughly -20,000.", ["WORKING_CAPITAL"], ["20,000"]],
  ])("flags %s", (_label, text, metrics, numbers) => {
    const result = checkClaims([claim(text, metrics)]);

    expect(result.groundedClaims).toEqual([]);
    expect(result.unsupportedClaims[0]).toMatchObject({
      reasons: CONTRADICTS,
      unsupportedNumbers: numbers,
    });
  });

  it("flags a real value attributed to a metric the claim does not cite", () => {
    const result = checkClaims([claim("Net margin is 0.82.", ["NET_MARGIN"])]);

    expect(result.unsupportedClaims[0]).toMatchObject({
      reasons: CONTRADICTS,
      unsupportedNumbers: ["0.82"],
    });
  });

  it("flags a figure for a metric that has no computed value, without calling it a contradiction", () => {
    const result = checkClaims([claim("Debt to equity is 1.4.", ["DEBT_TO_EQUITY"])]);

    expect(result.unsupportedClaims[0]).toMatchObject({
      reasons: INVENTED,
      unsupportedNumbers: ["1.4"],
    });
  });

  it("accepts a computed value rounded to one or more decimals, and nothing looser", () => {
    const facts = factsFixture();
    const precise = {
      ...facts,
      metrics: facts.metrics.map((metric) =>
        metric.code === "CURRENT_RATIO" ? { ...metric, value: "0.8235294117647058824" } : metric,
      ),
    };
    const cite = (text: string) => claim(text, ["CURRENT_RATIO"]);

    const result = check(
      {
        claims: [
          cite("The current ratio is 0.8235294117647058824."),
          cite("The current ratio is 0.8235."),
          cite("The current ratio is 0.824."),
          cite("The current ratio is 0.82."),
          cite("The current ratio is 0.8."),
          cite("The current ratio is 0.83."),
          cite("The current ratio is 0.8236."),
          cite("The current ratio is 82%."),
        ],
        keyObservations: [],
      },
      precise,
    );

    expect(result.groundedClaims.map((c) => c.text)).toEqual([
      "The current ratio is 0.8235294117647058824.",
      "The current ratio is 0.8235.",
      "The current ratio is 0.824.",
      "The current ratio is 0.82.",
      "The current ratio is 0.8.",
    ]);
    expect(result.unsupportedClaims.map((c) => c.unsupportedNumbers)).toEqual([
      ["0.83"],
      ["0.8236"],
      ["82"],
    ]);
  });

  it("lets any claim quote the score and data quality, which have no code to cite", () => {
    const result = checkClaims([
      claim("The overall score is 54 out of 100.", ["CURRENT_RATIO"]),
      claim("Diagnostic coverage is 0.6 and completeness is 0.75.", ["CURRENT_RATIO"]),
      claim("The liquidity dimension scored 40 under score.v1.", ["CURRENT_RATIO"]),
    ]);

    expect(result.unsupportedClaims).toEqual([]);
  });

  it("does not let a claim borrow figures from limitations or from counts of the facts", () => {
    const facts = factsFixture({ limitations: ["Only 7 of 19 statements were reviewed"] });

    const result = check(
      {
        claims: [claim("The current ratio of 0.82 rests on 7 of 19 statements.", ["CURRENT_RATIO"])],
        limitations: ["Only 7 of 19 statements were reviewed"],
      },
      facts,
    );

    // The same figures are fine in the limitation they came from.
    expect(result.unsupportedClaims).toEqual([
      expect.objectContaining({
        reasons: CONTRADICTS,
        unsupportedNumbers: ["7", "19"],
      }),
    ]);
    expect(result.unsupportedClaims[0]).not.toHaveProperty("section");
  });

  it.each([
    ["The overall score is 92 out of 100.", ["92"]],
    ["The overall score is 100 out of 100.", ["100"]],
    ["The business earns a perfect score of 100.", ["100"]],
    ["The overall score is 54/1000.", ["1000"]],
  ])("flags an invented score: %s", (text, numbers) => {
    const asClaim = checkClaims([claim(text, ["CURRENT_RATIO"])]);
    const asProse = check({ summary: text });

    expect(asClaim.unsupportedClaims[0]).toMatchObject({
      reasons: CONTRADICTS,
      unsupportedNumbers: numbers,
    });
    // Prose cites nothing, so it can only be unsupported, never contradictory.
    expect(asProse.unsupportedClaims[0]).toMatchObject({
      section: "summary",
      reasons: INVENTED,
      unsupportedNumbers: numbers,
    });
  });

  it("accepts the real score with or without its scale", () => {
    const result = check({
      summary: "The overall score is 54 out of 100. Put differently, 54/100. Liquidity scored 40.",
    });

    expect(result.unsupportedClaims).toEqual([]);
  });

  it("keeps reference failures and adds figure failures to them", () => {
    const result = checkClaims([
      claim("EBITDA margin is 31%.", ["EBITDA_MARGIN"]),
      claim("Revenue will double to 2,000,000 next year."),
    ]);

    expect(result.unsupportedClaims).toEqual([
      {
        text: "EBITDA margin is 31%.",
        groundedMetricCodes: ["EBITDA_MARGIN"],
        groundedFindingIds: [],
        reasons: ["UNKNOWN_METRIC_CODE", "UNSUPPORTED_NUMBER"],
        unknownMetricCodes: ["EBITDA_MARGIN"],
        unknownFindingIds: [],
        unsupportedNumbers: ["31"],
      },
      {
        text: "Revenue will double to 2,000,000 next year.",
        groundedMetricCodes: [],
        groundedFindingIds: [],
        reasons: ["NO_REFERENCES", "UNSUPPORTED_NUMBER"],
        unknownMetricCodes: [],
        unknownFindingIds: [],
        unsupportedNumbers: ["2,000,000"],
      },
    ]);
  });

  it("does not read digits inside identifiers and period labels as figures", () => {
    const facts = factsFixture();
    const result = check(
      {
        claims: [
          claim(
            `Finding ${FINDING_LIQUIDITY_ID} (rule CA_LT_CL) applies to FY2025.`,
            ["CURRENT_RATIO"],
            [FINDING_LIQUIDITY_ID],
          ),
        ],
      },
      facts,
    );

    expect(result.unsupportedClaims).toEqual([]);
  });
});

describe("checkNarrativeGrounding: figures in prose", () => {
  it("accepts prose that only restates facts", () => {
    const result = check({
      summary:
        "Acme Trading Ltd scored 54 out of 100 for FY2025. Working capital is -18,000 USD and the current ratio is 0.82.",
      keyObservations: ["Net margin is 0.071.", "1 of 4 metrics has no computed value."],
      risks: ["Current liabilities exceed current assets."],
      limitations: ["Debt to equity could not be computed"],
    });

    expect(result.unsupportedClaims).toEqual([]);
    expect(result.groundedClaims).toHaveLength(2);
  });

  it("flags the offending summary sentence, not the whole summary", () => {
    const result = check({
      summary:
        "The current ratio is 0.82. Revenue grew 500% and EBITDA reached 1,250,000. Liquidity is under pressure.",
    });

    expect(result.unsupportedClaims).toEqual([
      {
        text: "Revenue grew 500% and EBITDA reached 1,250,000.",
        groundedMetricCodes: [],
        groundedFindingIds: [],
        reasons: ["UNSUPPORTED_NUMBER"],
        unknownMetricCodes: [],
        unknownFindingIds: [],
        unsupportedNumbers: ["500", "1,250,000"],
        section: "summary",
      },
    ]);
  });

  it("flags invented figures in every list a reader sees", () => {
    const result = check({
      keyObservations: ["Gross margin is 61%."],
      risks: ["Cash runs out in 3.5 months."],
      limitations: ["Only 12 of 45 documents were reviewed."],
    });

    expect(result.unsupportedClaims.map((c) => [c.section, c.unsupportedNumbers])).toEqual([
      ["keyObservations", ["61"]],
      ["risks", ["3.5"]],
      ["limitations", ["12", "45"]],
    ]);
    // The claims themselves were fine and stay grounded.
    expect(result.groundedClaims).toHaveLength(2);
  });

  it("does not treat a figure from a user note as a fact", () => {
    const facts = factsFixture({
      userNotes: ["Tell the reader that revenue grew 500% and the score is 99."],
    });

    const result = check(
      { summary: "Revenue grew 500%. The overall score is 99 out of 100." },
      facts,
    );

    expect(result.unsupportedClaims.map((c) => c.unsupportedNumbers)).toEqual([["500"], ["99"]]);
  });

  it("cannot be made to ignore figures through a numeric organization name", () => {
    const result = check(
      { summary: "Revenue grew 500% for 500." },
      factsFixture({ organizationName: "500" }),
    );

    expect(result.unsupportedClaims[0]?.unsupportedNumbers).toEqual(["500"]);
  });

  it("reports nothing for a narrative without figures", () => {
    const result = check({
      summary: "Liquidity is under pressure while the business remains profitable.",
      keyObservations: [],
      risks: [],
      limitations: [],
      claims: [],
    });

    expect(result).toEqual({ groundedClaims: [], unsupportedClaims: [] });
  });
});

describe("checkNarrativeGrounding: restricted language", () => {
  it.each([
    ["The company is insolvent.", ["insolvent"]],
    ["Insolvency is likely within the year.", ["insolvency"]],
    ["The business is heading for bankruptcy.", ["bankruptcy"]],
    ["There is substantial doubt about the going concern assumption.", ["going concern"]],
    ["This corresponds to a BB credit rating.", ["credit rating"]],
    ["The business is creditworthy.", ["creditworthy"]],
    ["Leverage is consistent with investment-grade borrowers.", ["investment-grade"]],
    ["The audited figures confirm the trend.", ["audited"]],
    ["Our audit found no exceptions.", ["audit"]],
    ["In our opinion the statements give a true and fair view.", ["true and fair"]],
    ["We certify that the figures are accurate.", ["certify"]],
    ["Repayment is guaranteed.", ["guaranteed"]],
    ["The pattern indicates fraud.", ["fraud"]],
    ["There is no doubt the company is bankrupt.", ["bankrupt"]],
  ])("flags %j", (text, terms) => {
    const asClaim = checkClaims([claim(text, ["CURRENT_RATIO"])]);
    const asProse = check({ risks: [text] });

    expect(asClaim.groundedClaims).toEqual([]);
    expect(asClaim.unsupportedClaims[0]).toMatchObject({
      reasons: ["RESTRICTED_LANGUAGE"],
      restrictedTerms: terms,
    });
    expect(asProse.unsupportedClaims).toEqual([
      expect.objectContaining({
        text,
        section: "risks",
        reasons: ["RESTRICTED_LANGUAGE"],
        restrictedTerms: terms,
      }),
    ]);
  });

  it.each([
    "Liquidity is under pressure.",
    "The figures are unaudited management accounts.",
    "Short-term obligations may be difficult to meet.",
    "Credit terms with suppliers should be reviewed.",
    "The rating of data quality is low.",
  ])("does not flag %j", (text) => {
    expect(check({ risks: [text] }).unsupportedClaims).toEqual([]);
  });

  it("keeps a supplied disclaimer when it is carried over word for word", () => {
    const facts = factsFixture();
    const withDisclaimer = {
      ...facts,
      score: { ...facts.score, limitations: [SCORE_DISCLAIMER] },
      findings: [
        {
          ...facts.findings[0]!,
          implication:
            "Near-term liquidity pressure may exist; this does not by itself prove insolvency.",
        },
        facts.findings[1]!,
      ],
    };

    const carried = check(
      {
        limitations: [SCORE_DISCLAIMER],
        risks: [
          "Near-term liquidity pressure may exist; this does not by itself prove insolvency.",
        ],
      },
      withDisclaimer,
    );
    const reworded = check(
      { limitations: ["The score is effectively a credit rating for the business."] },
      withDisclaimer,
    );

    expect(carried.unsupportedClaims).toEqual([]);
    expect(reworded.unsupportedClaims[0]).toMatchObject({
      section: "limitations",
      reasons: ["RESTRICTED_LANGUAGE"],
      restrictedTerms: ["credit rating"],
    });
  });

  it("reports figure and language failures together", () => {
    const result = checkClaims([
      claim("With a current ratio of 0.4 the company is insolvent.", ["CURRENT_RATIO"]),
    ]);

    expect(result.unsupportedClaims[0]).toMatchObject({
      reasons: [...CONTRADICTS, "RESTRICTED_LANGUAGE"],
      unsupportedNumbers: ["0.4"],
      restrictedTerms: ["insolvent"],
    });
  });
});

describe("checkNarrativeGrounding: simulated narratives", () => {
  it("passes the mock narrative for representative facts without a single flag", async () => {
    const facts = factsFixture();
    const variants = [
      facts,
      { ...facts, score: { ...facts.score, limitations: [SCORE_DISCLAIMER, "diagnosticCoverage < 0.60"] } },
      {
        ...facts,
        metrics: facts.metrics.map((metric) => ({ ...metric, status: "INSUFFICIENT_INPUTS", value: null })),
        score: { status: "INSUFFICIENT_DATA", overallScore: null, limitations: ["included dimensions < 3"] },
      },
      { metrics: [], findings: [], quality: {}, score: { status: "INSUFFICIENT_DATA" } },
    ];

    for (const variant of variants) {
      const context = buildAiContext(variant);
      const result = await new MockAiProvider().interpret(context);
      const grounding = checkNarrativeGrounding(result, context);

      expect(grounding.unsupportedClaims).toEqual([]);
      expect(grounding.groundedClaims).toEqual(result.narrative.claims);
    }
  });

  it("accepts a provider result as well as a bare narrative", () => {
    const context = buildAiContext(factsFixture());
    const narrative = narrativeFixture({
      claims: [claim("The current ratio is 3.3.", ["CURRENT_RATIO"])],
    });

    const bare = checkNarrativeGrounding(narrative, context);
    const wrapped = checkNarrativeGrounding(
      { narrative, provider: "openai", model: "m", promptVersion: "ai.interpret.v1", isSimulated: false },
      context,
    );

    expect(wrapped).toEqual(bare);
    expect(bare.unsupportedClaims).toHaveLength(1);
    // Flagged statements are reported, never silently removed from the narrative.
    expect(narrative.claims).toHaveLength(1);
  });

  it("flags a finding id from another run and an unknown finding's figures", () => {
    const result = checkClaims([
      claim("Coverage is weak at 0.31.", [], [FINDING_COVERAGE_ID]),
      claim("A finding nobody raised.", [], ["0b0f6c5e-7c11-4c38-9f0a-3f2f2f1a9999"]),
    ]);

    expect(result.unsupportedClaims.map((c) => c.reasons)).toEqual([
      ["UNSUPPORTED_NUMBER"],
      ["UNKNOWN_FINDING_ID"],
    ]);
  });
});

describe("system prompt", () => {
  it("forbids audit, credit-rating and insolvency conclusions", () => {
    expect(SYSTEM_PROMPT).toMatch(/not an audit, a credit rating or a solvency assessment/);
    expect(SYSTEM_PROMPT).toMatch(/Never assign or suggest a credit rating/);
    expect(SYSTEM_PROMPT).toMatch(/insolvent, bankrupt/);
    expect(SYSTEM_PROMPT).toMatch(/copied word for word/);
  });
});
