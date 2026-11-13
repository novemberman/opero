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
