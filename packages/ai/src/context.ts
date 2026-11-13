import type {
  AiFindingFact,
  AiInterpretationContext,
  AiMetricFact,
  AiScoreComponentFact,
  UntrustedText,
} from "./types.js";

/**
 * Size caps. They bound prompt cost and make it impossible to smuggle a whole
 * document through a free-text field.
 */
export const AI_CONTEXT_LIMITS = {
  metrics: 100,
  findings: 100,
  limitations: 50,
  userNotes: 10,
  warningsPerMetric: 10,
  identifierChars: 120,
  labelChars: 200,
  textChars: 800,
  userNoteChars: 1_000,
} as const;

export type AiContextMetricInput = {
  code: string;
  label?: string | null;
  dimension?: string | null;
  status: string;
  value?: string | number | null;
  unit?: string | null;
  periodLabel?: string | null;
  warnings?: readonly string[] | null;
};

export type AiContextFindingInput = {
  id: string;
  ruleId?: string | null;
  category: string;
  severity: string;
  title: string;
  explanation: string;
  implication?: string | null;
  suggestedAction?: string | null;
  supportingMetrics?: readonly string[] | null;
};

export type AiContextQualityInput = {
  completeness?: string | number | null;
  consistency?: string | number | null;
  evidenceReliability?: string | number | null;
  diagnosticCoverage?: string | number | null;
};

export type AiContextScoreInput = {
  status: string;
  overallScore?: number | null;
  methodologyVersion?: string | null;
  components?: ReadonlyArray<{
    dimension: string;
    included: boolean;
    score?: number | null;
    exclusionReason?: string | null;
  }> | null;
  limitations?: readonly string[] | null;
};

/**
 * Structured diagnostic facts. Structurally compatible with
 * `DiagnosticEngineResult` (findings additionally need their persisted `id`).
 * Fields not listed here are ignored, so snapshot lines, evidence payloads
 * and document content cannot reach a provider.
 */
export type AiContextInput = {
  metrics: readonly AiContextMetricInput[];
  findings: readonly AiContextFindingInput[];
  quality: AiContextQualityInput;
  score: AiContextScoreInput;
  limitations?: readonly string[] | null;
  currency?: string | null;
  /** User-entered. Carried as untrusted data. */
  organizationName?: string | null;
  /** Extracted from documents. Carried as untrusted data. */
  periodLabel?: string | null;
  /** User-authored notes. Carried as untrusted data. */
  userNotes?: readonly string[] | null;
};

/**
 * Normalizes text to a single line of printable characters: whitespace runs
 * collapse to one space, control and invisible format characters (zero-width,
 * bidi overrides) are removed, and the result is capped at `maxChars`.
 */
export function sanitizeText(value: string, maxChars: number): string {
  const cleaned = value
    .replace(/\s+/gu, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** Wraps user or document text so downstream code treats it strictly as data. */
export function wrapUntrustedText(
  source: string,
  value: string,
  maxChars: number = AI_CONTEXT_LIMITS.userNoteChars,
): UntrustedText {
  return {
    kind: "untrusted_data",
    source: sanitizeText(source, AI_CONTEXT_LIMITS.identifierChars),
    text: sanitizeText(value, maxChars),
  };
}

function text(value: unknown, maxChars: number): string | null {
  if (typeof value === "string") {
    const cleaned = sanitizeText(value, maxChars);
    return cleaned.length ? cleaned : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textList(
  values: readonly unknown[] | null | undefined,
  maxItems: number,
  maxChars: number,
): string[] {
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const cleaned = text(value, maxChars);
    if (cleaned) seen.add(cleaned);
    if (seen.size >= maxItems) break;
  }
  return [...seen];
}

function untrusted(source: string, value: unknown, maxChars: number): UntrustedText | null {
  if (typeof value !== "string") return null;
  const wrapped = wrapUntrustedText(source, value, maxChars);
  return wrapped.text.length ? wrapped : null;
}

/**
 * Builds the only payload a provider may see. Every field is copied
 * explicitly from an allowlist and coerced to a bounded string, number or
 * boolean, so raw document bytes, snapshot lines and arbitrary nested
 * payloads never enter the context.
 */
export function buildAiContext(input: AiContextInput): AiInterpretationContext {
  const { identifierChars, labelChars, textChars } = AI_CONTEXT_LIMITS;

  const metrics: AiMetricFact[] = [];
  const metricCodes = new Set<string>();
  for (const metric of input.metrics) {
    if (metrics.length >= AI_CONTEXT_LIMITS.metrics) break;
    const code = text(metric.code, identifierChars);
    if (!code) continue;
    metricCodes.add(code);
    metrics.push({
      code,
      label: text(metric.label, labelChars) ?? code,
      dimension: text(metric.dimension, identifierChars),
      status: text(metric.status, identifierChars) ?? "UNKNOWN",
      value: text(metric.value, identifierChars),
      unit: text(metric.unit, identifierChars),
      periodLabel: text(metric.periodLabel, labelChars),
      warnings: textList(metric.warnings, AI_CONTEXT_LIMITS.warningsPerMetric, textChars),
    });
  }

  const findings: AiFindingFact[] = [];
  const findingIds = new Set<string>();
  for (const finding of input.findings) {
    if (findings.length >= AI_CONTEXT_LIMITS.findings) break;
    const id = text(finding.id, identifierChars);
    if (!id || findingIds.has(id)) continue;
    findingIds.add(id);
    findings.push({
      id,
      ruleId: text(finding.ruleId, identifierChars),
      category: text(finding.category, identifierChars) ?? "UNKNOWN",
      severity: text(finding.severity, identifierChars) ?? "UNKNOWN",
      title: text(finding.title, labelChars) ?? id,
      explanation: text(finding.explanation, textChars) ?? "",
      implication: text(finding.implication, textChars),
      suggestedAction: text(finding.suggestedAction, textChars),
      supportingMetrics: textList(finding.supportingMetrics, 40, identifierChars),
    });
  }

  const components: AiScoreComponentFact[] = [];
  for (const component of input.score.components ?? []) {
    const dimension = text(component.dimension, identifierChars);
    if (!dimension) continue;
    components.push({
      dimension,
      included: component.included === true,
      score: finiteNumber(component.score),
      exclusionReason: text(component.exclusionReason, textChars),
    });
  }

  const scoreLimitations = textList(
    input.score.limitations,
    AI_CONTEXT_LIMITS.limitations,
    textChars,
  );

  const userNotes: UntrustedText[] = [];
  for (const [index, note] of (input.userNotes ?? []).entries()) {
    if (userNotes.length >= AI_CONTEXT_LIMITS.userNotes) break;
    const wrapped = untrusted(`userNote[${index}]`, note, AI_CONTEXT_LIMITS.userNoteChars);
    if (wrapped) userNotes.push(wrapped);
  }

  return {
    currency: text(input.currency, identifierChars),
    organizationName: untrusted("organizationName", input.organizationName, labelChars),
    periodLabel: untrusted("periodLabel", input.periodLabel, labelChars),
    metrics,
    findings,
    quality: {
      completeness: text(input.quality.completeness, identifierChars),
      consistency: text(input.quality.consistency, identifierChars),
      evidenceReliability: text(input.quality.evidenceReliability, identifierChars),
      diagnosticCoverage: text(input.quality.diagnosticCoverage, identifierChars),
    },
    score: {
      status: text(input.score.status, identifierChars) ?? "UNKNOWN",
      overallScore: finiteNumber(input.score.overallScore),
      methodologyVersion: text(input.score.methodologyVersion, identifierChars),
      components,
      limitations: scoreLimitations,
    },
    limitations: textList(
      [...(input.limitations ?? []), ...scoreLimitations],
      AI_CONTEXT_LIMITS.limitations,
      textChars,
    ),
    userNotes,
    allowedMetricCodes: [...metricCodes],
    allowedFindingIds: [...findingIds],
  };
}
