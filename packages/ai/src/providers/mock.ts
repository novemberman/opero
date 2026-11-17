import { PROMPT_VERSION } from "../prompt.js";
import { AI_OUTPUT_LIMITS, parseAiNarrative, type AiClaim } from "../schema.js";
import type {
  AiFindingFact,
  AiInterpretationContext,
  AiInterpretationResult,
  AiMetricFact,
  AiProviderPort,
} from "../types.js";

export const MOCK_AI_MODEL = "mock-deterministic-v1";

export const SIMULATED_NOTICE =
  "Simulated interpretation — not live AI. This narrative was assembled by fixed rules from the diagnostic facts.";

const RISK_SEVERITIES = new Set(["MEDIUM", "HIGH", "CRITICAL"]);

const TREND_CODES = new Set(["REVENUE_GROWTH", "PROFIT_GROWTH", "NET_MARGIN_MOVEMENT"]);

function clip(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars - 1).trimEnd()}…`;
}

function isComputed(metric: AiMetricFact): metric is AiMetricFact & { value: string } {
  return metric.status === "COMPUTED" && metric.value !== null;
}

function describeMetric(metric: AiMetricFact & { value: string }): string {
  const unit = metric.unit ? ` (${metric.unit})` : "";
  return `${metric.label} [${metric.code}] was computed as ${metric.value}${unit}.`;
}

function describeFinding(finding: AiFindingFact): string {
  const explanation = finding.explanation ? `: ${finding.explanation}` : "";
  return `${finding.title} (${finding.severity})${explanation}`;
}

function isRisk(finding: AiFindingFact): boolean {
  return finding.category === "RISK" || RISK_SEVERITIES.has(finding.severity);
}

function dimensionMap(dimension: string): string {
  if (dimension === "leverage") return "solvency";
  if (dimension === "cash_flow") return "cash flow";
  return dimension;
}

function interpretDimension(
  computed: Array<AiMetricFact & { value: string }>,
  dimension: string,
  itemChars: number,
): string {
  const rows = computed.filter((metric) => metric.dimension === dimension);
  if (!rows.length) {
    return `No computed ${dimensionMap(dimension)} metrics were available in the diagnostic facts.`;
  }
  return clip(
    `${dimensionMap(dimension)} metrics from the diagnostic facts: ${rows
      .map((metric) => `${metric.label} [${metric.code}] = ${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`)
      .join("; ")}.`,
    itemChars,
  );
}

/**
 * Deterministic stand-in for a language model. It restates facts already in
 * the context using fixed templates, never performs I/O, and always labels
 * its result `isSimulated: true`. Identical contexts yield identical results.
 *
 * User notes, organization names and document period labels are never read,
 * so untrusted text cannot influence the narrative.
 */
export class MockAiProvider implements AiProviderPort {
  readonly name = "mock" as const;

  async interpret(context: AiInterpretationContext): Promise<AiInterpretationResult> {
    const computed = context.metrics.filter(isComputed);
    const unavailable = context.metrics.filter((metric) => !isComputed(metric));
    const allowedMetricCodes = new Set(context.allowedMetricCodes);
    const { itemChars, listItems } = AI_OUTPUT_LIMITS;

    const scoreSentence =
      context.score.status === "SCORED" && context.score.overallScore !== null
        ? `The overall score is ${context.score.overallScore} out of 100.`
        : `No overall score was produced (score status: ${context.score.status}).`;

    const summary = [
      SIMULATED_NOTICE,
      scoreSentence,
      `${computed.length} of ${context.metrics.length} metrics were computed and ${context.findings.length} findings were raised.`,
    ].join(" ");

    const claims: AiClaim[] = [
      ...context.findings.map((finding) => ({
        text: clip(describeFinding(finding), itemChars),
        groundedMetricCodes: finding.supportingMetrics.filter((code) =>
          allowedMetricCodes.has(code),
        ),
        groundedFindingIds: [finding.id],
      })),
      ...computed.map((metric) => ({
        text: clip(describeMetric(metric), itemChars),
        groundedMetricCodes: [metric.code],
        groundedFindingIds: [],
      })),
    ].slice(0, AI_OUTPUT_LIMITS.claims);

    const limitations = [SIMULATED_NOTICE];
    if (unavailable.length) {
      const codes = [...new Set(unavailable.map((metric) => metric.code))].join(", ");
      limitations.push(
        clip(`${unavailable.length} metrics have no computed value: ${codes}.`, itemChars),
      );
    }
    for (const limitation of context.limitations) limitations.push(clip(limitation, itemChars));

    const recommendations = context.findings
      .map((finding) => (finding.suggestedAction ?? "").trim())
      .filter(Boolean)
      .slice(0, listItems)
      .map((action) => clip(action, itemChars));

    const trendMetrics = computed.filter((metric) => TREND_CODES.has(metric.code));
    const trendCommentary = trendMetrics.length
      ? clip(
          `Period-over-period metrics from the diagnostic facts: ${trendMetrics
            .map((metric) => `${metric.label} [${metric.code}] = ${metric.value}`)
            .join("; ")}.`,
          itemChars,
        )
      : "";

    const dataQualityExplanation = clip(
      [
        `Completeness ${context.quality.completeness}; consistency ${context.quality.consistency}; evidence reliability ${context.quality.evidenceReliability}; diagnostic coverage ${context.quality.diagnosticCoverage}.`,
        unavailable.length
          ? `${unavailable.length} metrics remain unavailable and are not treated as zero.`
          : "All supplied metrics in this run were computed.",
      ].join(" "),
      itemChars,
    );

    const narrative = parseAiNarrative({
      summary,
      keyObservations: computed
        .slice(0, listItems)
        .map((metric) => clip(describeMetric(metric), itemChars)),
      risks: context.findings
        .filter(isRisk)
        .slice(0, listItems)
        .map((finding) => clip(describeFinding(finding), itemChars)),
      limitations: limitations.slice(0, listItems),
      recommendations,
      profitabilityInterpretation: interpretDimension(computed, "profitability", itemChars),
      liquidityInterpretation: interpretDimension(computed, "liquidity", itemChars),
      solvencyInterpretation: interpretDimension(computed, "leverage", itemChars),
      efficiencyInterpretation: interpretDimension(computed, "efficiency", itemChars),
      cashFlowInterpretation: interpretDimension(computed, "cash_flow", itemChars),
      dataQualityExplanation,
      trendCommentary,
      claims,
    });

    return {
      narrative,
      provider: this.name,
      model: MOCK_AI_MODEL,
      promptVersion: PROMPT_VERSION,
      isSimulated: true,
    };
  }
}
