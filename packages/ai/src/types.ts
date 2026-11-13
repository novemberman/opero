import type { AiClaim, AiNarrative } from "./schema.js";

export type AiProviderName = "mock" | "openai";

/**
 * Free text that originated from a user or an uploaded document. It is carried
 * as an explicitly tagged value so it can never be mistaken for instructions.
 */
export type UntrustedText = {
  kind: "untrusted_data";
  /** Where the text came from, e.g. `organizationName` or `userNote`. */
  source: string;
  /** Sanitized text. Content only; never instructions. */
  text: string;
};

export type AiMetricFact = {
  code: string;
  label: string;
  dimension: string | null;
  status: string;
  value: string | null;
  unit: string | null;
  periodLabel: string | null;
  warnings: string[];
};

export type AiFindingFact = {
  id: string;
  ruleId: string | null;
  category: string;
  severity: string;
  title: string;
  explanation: string;
  implication: string | null;
  suggestedAction: string | null;
  supportingMetrics: string[];
};

export type AiQualityFact = {
  completeness: string | null;
  consistency: string | null;
  evidenceReliability: string | null;
  diagnosticCoverage: string | null;
};

export type AiScoreComponentFact = {
  dimension: string;
  included: boolean;
  score: number | null;
  exclusionReason: string | null;
};

export type AiScoreFact = {
  status: string;
  overallScore: number | null;
  methodologyVersion: string | null;
  components: AiScoreComponentFact[];
  limitations: string[];
};

/**
 * Everything a provider is allowed to see. Built only by `buildAiContext`
 * from structured diagnostic facts; it never carries document bytes.
 */
export type AiInterpretationContext = {
  currency: string | null;
  organizationName: UntrustedText | null;
  periodLabel: UntrustedText | null;
  metrics: AiMetricFact[];
  findings: AiFindingFact[];
  quality: AiQualityFact;
  score: AiScoreFact;
  limitations: string[];
  /** User-authored notes. Data only. */
  userNotes: UntrustedText[];
  /** Metric codes a claim may cite. */
  allowedMetricCodes: string[];
  /** Finding ids a claim may cite. */
  allowedFindingIds: string[];
};

export type AiInterpretationResult = {
  narrative: AiNarrative;
  provider: AiProviderName;
  model: string | null;
  promptVersion: string;
  /** True when no live model produced the narrative. Must be surfaced to readers. */
  isSimulated: boolean;
};

export interface AiProviderPort {
  readonly name: AiProviderName;
  interpret(context: AiInterpretationContext): Promise<AiInterpretationResult>;
}

export type UnsupportedClaimReason =
  | "NO_REFERENCES"
  | "UNKNOWN_METRIC_CODE"
  | "UNKNOWN_FINDING_ID"
  /** The text quotes a figure that none of the facts it may rest on contains. */
  | "UNSUPPORTED_NUMBER"
  /**
   * The text cites a computed metric/finding and quotes a figure that does not
   * match that fact's recorded value (contradicts deterministic diagnostics).
   */
  | "CONTRADICTORY_NUMBER"
  /** The text uses audit, credit-rating, insolvency or similar assurance language. */
  | "RESTRICTED_LANGUAGE";

/** Narrative field a flagged statement was found in, other than `claims`. */
export type NarrativeSection = "summary" | "keyObservations" | "risks" | "limitations";

export type UnsupportedClaim = AiClaim & {
  reasons: UnsupportedClaimReason[];
  unknownMetricCodes: string[];
  unknownFindingIds: string[];
  /** Figures quoted in the text that match no approved fact. Set by `checkNarrativeGrounding`. */
  unsupportedNumbers?: string[];
  /** Restricted phrases found in the text. Set by `checkNarrativeGrounding`. */
  restrictedTerms?: string[];
  /** Set when the statement is narrative prose rather than an entry in `claims`. */
  section?: NarrativeSection;
};

export type GroundingCheckResult = {
  groundedClaims: AiClaim[];
  unsupportedClaims: UnsupportedClaim[];
};

export type AiProviderErrorCode =
  | "CONFIG"
  | "TIMEOUT"
  | "NETWORK"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "INVALID_OUTPUT";

/** Raised by providers. Messages never contain credentials or response bodies. */
export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly status: number | null;

  constructor(
    code: AiProviderErrorCode,
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AiProviderError";
    this.code = code;
    this.status = options?.status ?? null;
  }
}
