import { describe, expect, it } from "vitest";
import { assembleReportModel, DEFAULT_REPORT_TITLE, DISCLOSURES } from "./assemble.js";
import { aiNarrativeFixture, payloadFixture } from "./test-fixtures.js";

describe("assembleReportModel", () => {
  it("copies diagnostic results into the model without altering values", () => {
    const model = assembleReportModel(payloadFixture(), {
      title: "Acme X-Ray — FY2025",
      generatedAt: "2026-11-13T00:00:00.000Z",
    });

    expect(model.title).toBe("Acme X-Ray — FY2025");
    expect(model.orgName).toBe("Acme Trading Ltd");
    expect(model.period).toBe("FY2025");
    expect(model.currency).toBe("USD");
    expect(model.generatedAt).toBe("2026-11-13T00:00:00.000Z");
    expect(model.readinessStatus).toBe("PARTIALLY_READY");
    expect(model.score).toEqual({
      status: "SCORED",
      overall: 54,
      limitations: [
        "score.v1 thresholds are provisional heuristics, not industry benchmarks",
        "Missing dimensions are not renormalized to hide coverage gaps",
      ],
    });
    expect(model.metrics).toEqual([
      {
        code: "CURRENT_RATIO",
        label: "Current ratio",
        dimension: "liquidity",
        status: "COMPUTED",
        value: "0.8235294117647058824",
        unit: "ratio",
        periodLabel: "FY2025",
      },
      {
        code: "WORKING_CAPITAL",
        label: "Working capital",
        dimension: "liquidity",
        status: "COMPUTED",
        value: "-18000",
        unit: "currency",
        periodLabel: "FY2025",
      },
      {
        code: "DEBT_TO_EQUITY",
        label: "Debt to equity",
        dimension: "leverage",
        status: "INSUFFICIENT_INPUTS",
        value: null,
        unit: "ratio",
        periodLabel: "FY2025",
      },
    ]);
    expect(model.findings).toEqual([
      {
        id: "0b0f6c5e-7c11-4c38-9f0a-3f2f2f1a0001",
        category: "RISK",
        severity: "HIGH",
        title: "Current liabilities exceed current assets",
        explanation: "Current assets do not cover current liabilities for the period.",
        implication: "Short-term obligations may be difficult to meet.",
        suggestedAction: "Review the timing of payables and receivables.",
      },
    ]);
    expect(model.quality).toEqual({
      completeness: "0.75",
      consistency: "1",
      evidenceReliability: "0.9",
      diagnosticCoverage: "0.6",
    });
  });

  it("is non-verified by default and says so first in the disclosures", () => {
    const model = assembleReportModel(payloadFixture());

    expect(model.verifiedPublication).toBe(false);
    expect(model.title).toBe(DEFAULT_REPORT_TITLE);
    expect(model.generatedAt).toBeNull();
    expect(model.disclosures).toEqual([
      DISCLOSURES.notVerified,
      DISCLOSURES.basis,
      DISCLOSURES.notAdvice,
      DISCLOSURES.provisionalScore,
    ]);
  });

  it("marks the report verified only on an explicit true", () => {
    const verified = assembleReportModel(payloadFixture(), { verifiedPublication: true });
    const truthy = assembleReportModel(payloadFixture(), {
      verifiedPublication: "yes" as unknown as boolean,
    });

    expect(verified.verifiedPublication).toBe(true);
    expect(verified.disclosures).not.toContain(DISCLOSURES.notVerified);
    expect(truthy.verifiedPublication).toBe(false);
    expect(truthy.disclosures).toContain(DISCLOSURES.notVerified);
  });

  it("never marks a report without a produced score as verified", () => {
    const unscored = [
      { status: "INSUFFICIENT_DATA", overallScore: null },
      { status: "INSUFFICIENT_DATA", overallScore: 91 },
      { status: "SCORED", overallScore: null },
    ];

    for (const score of unscored) {
      const model = assembleReportModel(payloadFixture({ score }), { verifiedPublication: true });

      expect(model.verifiedPublication).toBe(false);
      expect(model.disclosures[0]).toBe(DISCLOSURES.notVerified);
      expect(model.disclosures).toContain(DISCLOSURES.notScored);
    }
  });

  it("works without an AI narrative", () => {
    const model = assembleReportModel(payloadFixture());
    const withNull = assembleReportModel(payloadFixture(), { aiNarrative: null });

    expect(model).not.toHaveProperty("aiNarrative");
    expect(withNull).not.toHaveProperty("aiNarrative");
    expect(model.disclosures).not.toContain(DISCLOSURES.simulatedAi);
    expect(model.disclosures).not.toContain(DISCLOSURES.liveAi);
  });

  it("carries a simulated AI narrative with its flag and disclosure", () => {
    const model = assembleReportModel(payloadFixture(), { aiNarrative: aiNarrativeFixture() });

    expect(model.aiNarrative).toEqual({
      isSimulated: true,
      summary: "Liquidity is under pressure for the period.",
      keyObservations: ["Current ratio [CURRENT_RATIO] was computed as 0.8235."],
      risks: ["Current liabilities exceed current assets (HIGH)."],
      limitations: ["Debt to equity could not be computed."],
      provider: "mock",
      model: "mock-deterministic-v1",
    });
    expect(model.disclosures).toContain(DISCLOSURES.simulatedAi);
    expect(model.disclosures).not.toContain(DISCLOSURES.liveAi);
  });

  it("discloses a live AI narrative as AI-generated", () => {
    const model = assembleReportModel(payloadFixture(), {
      aiNarrative: aiNarrativeFixture({ isSimulated: false, provider: "openai", model: "m-1" }),
    });

    expect(model.aiNarrative?.isSimulated).toBe(false);
    expect(model.disclosures).toContain(DISCLOSURES.liveAi);
    expect(model.disclosures).not.toContain(DISCLOSURES.simulatedAi);
  });

  it("treats a narrative of unknown origin as simulated", () => {
    const model = assembleReportModel(payloadFixture(), {
      aiNarrative: aiNarrativeFixture({ isSimulated: undefined as unknown as boolean }),
    });

    expect(model.aiNarrative?.isSimulated).toBe(true);
    expect(model.disclosures).toContain(DISCLOSURES.simulatedAi);
  });

  it("omits an AI narrative that has no summary", () => {
    const model = assembleReportModel(payloadFixture(), {
      aiNarrative: aiNarrativeFixture({ narrative: { summary: "   " } }),
    });

    expect(model).not.toHaveProperty("aiNarrative");
    expect(model.disclosures).not.toContain(DISCLOSURES.simulatedAi);
  });

  it("reports no score when the engine did not produce one", () => {
    const model = assembleReportModel(
      payloadFixture({
        score: {
          status: "INSUFFICIENT_DATA",
          overallScore: null,
          limitations: ["diagnosticCoverage < 0.5"],
        },
      }),
    );

    expect(model.score).toEqual({
      status: "INSUFFICIENT_DATA",
      overall: null,
      limitations: ["diagnosticCoverage < 0.5"],
    });
    expect(model.disclosures).toContain(DISCLOSURES.notScored);
    expect(model.disclosures).not.toContain(DISCLOSURES.provisionalScore);
  });

  it("never shows a number for a status other than SCORED", () => {
    const model = assembleReportModel(
      payloadFixture({ score: { status: "INSUFFICIENT_DATA", overallScore: 91 } }),
    );

    expect(model.score.overall).toBeNull();
  });

  it("appends additional disclosures once each", () => {
    const model = assembleReportModel(payloadFixture(), {
      additionalDisclosures: ["Prepared for internal review.", DISCLOSURES.notAdvice, "  "],
    });

    expect(model.disclosures).toEqual([
      DISCLOSURES.notVerified,
      DISCLOSURES.basis,
      DISCLOSURES.notAdvice,
      DISCLOSURES.provisionalScore,
      "Prepared for internal review.",
    ]);
  });

  it.each([
    [{ periodLabel: null }, "2025-01-01 to 2025-12-31"],
    [{ periodLabel: null, periodStart: null }, "Period ending 2025-12-31"],
    [{ periodLabel: null, periodEnd: null }, "Period starting 2025-01-01"],
    [{ periodLabel: null, periodStart: null, periodEnd: null }, "Period not specified"],
  ])("describes the period from %o", (overrides, expected) => {
    expect(assembleReportModel(payloadFixture(overrides)).period).toBe(expected);
  });

  it("falls back to explicit placeholders for missing identity fields", () => {
    const model = assembleReportModel(
      payloadFixture({ organizationName: null, readinessStatus: null, currency: null }),
    );

    expect(model.orgName).toBe("Organization not specified");
    expect(model.currency).toBeNull();
    expect(model).not.toHaveProperty("readinessStatus");
  });

  it("ignores fields outside the payload contract", () => {
    const payload = payloadFixture();
    const model = assembleReportModel({
      ...payload,
      documentBytes: Buffer.from("CONFIDENTIAL-LEDGER-BYTES"),
      metrics: payload.metrics.map((metric) => ({ ...metric, inputRefs: ["CONFIDENTIAL-REF"] })),
    } as typeof payload);

    expect(JSON.stringify(model)).not.toContain("CONFIDENTIAL");
  });

  it("flattens whitespace and control characters in text", () => {
    const model = assembleReportModel(
      payloadFixture({ organizationName: "  Acme\r\n\tTrading\u0000 Ltd\u200B " }),
    );

    expect(model.orgName).toBe("Acme Trading Ltd");
  });
});
