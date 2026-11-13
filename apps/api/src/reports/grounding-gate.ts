import { ConflictException } from "@nestjs/common";
import {
  buildAiContext,
  checkNarrativeGrounding,
  classifyGroundingResult,
  GROUNDING_VALIDATION_VERSION,
  groundingAllowsPublication,
  type GroundingValidationResult,
  type ValidatableNarrative,
} from "@opero/ai";
import type { StoredReportAiNarrative, StoredReportPayload } from "./report-payload";

export type StoredGroundingValidation = {
  version: string;
  validatedAt: string;
  passed: boolean;
  criticalCount: number;
  highCount: number;
  unsupportedClaimCount: number;
  criticalViolations: Array<{
    text: string;
    reasons: string[];
    severity: string;
    section?: string;
    unsupportedNumbers?: string[];
    restrictedTerms?: string[];
  }>;
};

/**
 * Re-validates the exact AI narrative frozen into a report version against the
 * deterministic metrics/findings also frozen in that version.
 */
export function validateReportAiGrounding(
  payload: StoredReportPayload,
): GroundingValidationResult | null {
  const ai = payload.aiNarrative;
  if (!ai) return null;

  const narrative: ValidatableNarrative = {
    summary: ai.narrative.summary,
    keyObservations: [...(ai.narrative.keyObservations ?? [])],
    risks: [...(ai.narrative.risks ?? [])],
    limitations: [...(ai.narrative.limitations ?? [])],
    claims: [...(ai.claims ?? [])],
  };

  const context = buildAiContext({
    metrics: payload.metrics.map((metric) => ({
      code: metric.code,
      label: metric.label ?? metric.code,
      dimension: metric.dimension ?? "unknown",
      status: metric.status,
      value: metric.value == null ? null : String(metric.value),
      unit: metric.unit ?? null,
      periodLabel: metric.periodLabel ?? null,
      warnings: [],
    })),
    findings: payload.findings.map((finding) => ({
      id: finding.id ?? finding.title,
      ruleId: finding.id ?? finding.title,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      explanation: finding.explanation ?? "",
      implication: finding.implication ?? "",
      suggestedAction: finding.suggestedAction ?? "",
      supportingMetrics: [],
    })),
    quality: payload.quality,
    score: {
      status: payload.score.status,
      overallScore: payload.score.overallScore,
      methodologyVersion: payload.score.methodologyVersion,
      limitations: payload.score.limitations,
      components: [],
    },
    limitations: payload.score.limitations,
    currency: payload.currency,
    periodLabel: payload.periodLabel,
    organizationName: payload.organizationName,
  });

  return classifyGroundingResult(checkNarrativeGrounding(narrative, context));
}

export function toStoredGroundingValidation(
  result: GroundingValidationResult,
  validatedAt: Date,
): StoredGroundingValidation {
  return {
    version: result.version || GROUNDING_VALIDATION_VERSION,
    validatedAt: validatedAt.toISOString(),
    passed: groundingAllowsPublication(result),
    criticalCount: result.criticalViolations.length,
    highCount: result.highViolations.length,
    unsupportedClaimCount: result.unsupportedClaims.length,
    criticalViolations: result.criticalViolations.map((v) => ({
      text: v.text,
      reasons: [...v.reasons],
      severity: v.severity,
      ...(v.section ? { section: v.section } : {}),
      ...(v.unsupportedNumbers?.length ? { unsupportedNumbers: v.unsupportedNumbers } : {}),
      ...(v.restrictedTerms?.length ? { restrictedTerms: v.restrictedTerms } : {}),
    })),
  };
}

export function assertNoCriticalGrounding(
  payload: StoredReportPayload,
  stage: "approve" | "publish",
): StoredGroundingValidation | null {
  const result = validateReportAiGrounding(payload);
  if (!result) return null;
  const stored = toStoredGroundingValidation(result, new Date());
  if (!stored.passed) {
    throw new ConflictException({
      message: `Unresolved critical AI grounding violation(s) block ${stage}; correct or regenerate the interpretation`,
      code: "CRITICAL_GROUNDING_VIOLATIONS",
      groundingValidation: stored,
    });
  }
  return stored;
}

/** Prefer claims from the AI version when attaching to a report payload. */
export function claimsFromAiVersion(narrative: unknown): StoredReportAiNarrative["claims"] {
  const raw = (narrative ?? {}) as { claims?: unknown };
  if (!Array.isArray(raw.claims)) return [];
  return raw.claims
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      text: typeof item.text === "string" ? item.text : "",
      groundedMetricCodes: Array.isArray(item.groundedMetricCodes)
        ? item.groundedMetricCodes.filter((v): v is string => typeof v === "string")
        : [],
      groundedFindingIds: Array.isArray(item.groundedFindingIds)
        ? item.groundedFindingIds.filter((v): v is string => typeof v === "string")
        : [],
    }))
    .filter((claim) => claim.text.length > 0);
}
