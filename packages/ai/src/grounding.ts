import type { AiClaim, AiNarrative } from "./schema.js";
import type {
  AiFindingFact,
  AiInterpretationContext,
  AiMetricFact,
  GroundingCheckResult,
  NarrativeSection,
  UnsupportedClaim,
  UnsupportedClaimReason,
} from "./types.js";

type ClaimSource = { claims: readonly AiClaim[] } | { narrative: { claims: readonly AiClaim[] } };

function claimsOf(source: ClaimSource): readonly AiClaim[] {
  return "narrative" in source ? source.narrative.claims : source.claims;
}

function normalized(values: Iterable<string>): Set<string> {
  const set = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) set.add(trimmed);
  }
  return set;
}

type ReferenceCheck = {
  citedMetrics: string[];
  citedFindings: string[];
  unknownMetricCodes: string[];
  unknownFindingIds: string[];
  reasons: UnsupportedClaimReason[];
};

function checkReferences(
  claim: AiClaim,
  metricCodes: ReadonlySet<string>,
  findingIds: ReadonlySet<string>,
): ReferenceCheck {
  const citedMetrics = [...normalized(claim.groundedMetricCodes)];
  const citedFindings = [...normalized(claim.groundedFindingIds)];
  const unknownMetricCodes = citedMetrics.filter((code) => !metricCodes.has(code));
  const unknownFindingIds = citedFindings.filter((id) => !findingIds.has(id));

  const reasons: UnsupportedClaimReason[] = [];
  if (citedMetrics.length + citedFindings.length === 0) reasons.push("NO_REFERENCES");
  if (unknownMetricCodes.length) reasons.push("UNKNOWN_METRIC_CODE");
  if (unknownFindingIds.length) reasons.push("UNKNOWN_FINDING_ID");
  return { citedMetrics, citedFindings, unknownMetricCodes, unknownFindingIds, reasons };
}

/**
 * Splits claims into those fully backed by deterministic facts and those that
 * are not. A claim is grounded only if it cites at least one metric code or
 * finding id and every reference it cites is in the allowed sets. Matching is
 * exact (case-sensitive) after trimming.
 *
 * This checks references only. `checkNarrativeGrounding` additionally checks
 * the figures and the language of the whole narrative.
 *
 * Accepts either a provider result or a bare narrative.
 */
export function checkClaimGrounding(
  result: ClaimSource,
  allowedMetricCodes: Iterable<string>,
  allowedFindingIds: Iterable<string>,
): GroundingCheckResult {
  const metricCodes = normalized(allowedMetricCodes);
  const findingIds = normalized(allowedFindingIds);

  const groundedClaims: AiClaim[] = [];
  const unsupportedClaims: UnsupportedClaim[] = [];

  for (const claim of claimsOf(result)) {
    const { reasons, unknownMetricCodes, unknownFindingIds } = checkReferences(
      claim,
      metricCodes,
      findingIds,
    );
    if (reasons.length) {
      unsupportedClaims.push({ ...claim, reasons, unknownMetricCodes, unknownFindingIds });
    } else {
      groundedClaims.push(claim);
    }
  }

  return { groundedClaims, unsupportedClaims };
}

/** A figure as written: digits with optional thousands separators and decimals. */
const NUMBER_PATTERN = /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;

/** Canonical magnitude: no separators, leading zeros or trailing decimal zeros. */
function canonicalNumber(token: string): string {
  const [whole = "0", fraction = ""] = token.replaceAll(",", "").split(".");
  const integer = whole.replace(/^0+(?=\d)/, "");
  const decimals = fraction.replace(/0+$/, "");
  return decimals ? `${integer}.${decimals}` : integer;
}

function fractionDigits(token: string): number {
  return token.split(".")[1]?.length ?? 0;
}

/** Rounds a canonical magnitude half up to `digits` (>= 1) decimals, without floats. */
function roundMagnitude(value: string, digits: number): string {
  const [whole = "0", fraction = ""] = value.split(".");
  let scaled = BigInt(whole + fraction.slice(0, digits).padEnd(digits, "0"));
  if ((fraction[digits] ?? "0") >= "5") scaled += 1n;
  const text = scaled.toString().padStart(digits + 1, "0");
  return canonicalNumber(`${text.slice(0, -digits)}.${text.slice(-digits)}`);
}

/**
 * Figures a statement may quote. `exact` holds every number that appears in
 * the facts; `values` holds the computed values, which may also be quoted
 * rounded to at least one decimal place.
 */
type FactNumbers = { exact: Set<string>; values: Set<string> };

function emptyNumbers(): FactNumbers {
  return { exact: new Set(), values: new Set() };
}

function addText(numbers: FactNumbers, ...texts: Array<string | null | undefined>): void {
  for (const text of texts) {
    for (const token of text?.match(NUMBER_PATTERN) ?? []) numbers.exact.add(canonicalNumber(token));
  }
}

function addValue(numbers: FactNumbers, value: string | number | null | undefined): void {
  if (value === null || value === undefined) return;
  for (const token of String(value).match(NUMBER_PATTERN) ?? []) {
    const canonical = canonicalNumber(token);
    numbers.exact.add(canonical);
    if (canonical.includes(".")) numbers.values.add(canonical);
  }
}

function merge(target: FactNumbers, source: FactNumbers | undefined): void {
  if (!source) return;
  for (const value of source.exact) target.exact.add(value);
  for (const value of source.values) target.values.add(value);
}

function isSupported(token: string, numbers: FactNumbers): boolean {
  const canonical = canonicalNumber(token);
  if (numbers.exact.has(canonical)) return true;
  const digits = fractionDigits(token);
  if (digits === 0) return false;
  for (const value of numbers.values) {
    if (fractionDigits(value) > digits && roundMagnitude(value, digits) === canonical) return true;
  }
  return false;
}

function metricNumbers(metric: AiMetricFact): FactNumbers {
  const numbers = emptyNumbers();
  addValue(numbers, metric.value);
  addText(numbers, metric.code, metric.label, metric.periodLabel, metric.unit, ...metric.warnings);
  return numbers;
}

function findingNumbers(finding: AiFindingFact): FactNumbers {
  const numbers = emptyNumbers();
  addText(
    numbers,
    finding.title,
    finding.explanation,
    finding.implication,
    finding.suggestedAction,
    finding.ruleId,
  );
  return numbers;
}

/**
 * "54 out of 100" and "54/100" quote one figure, 54. The scale is dropped
 * before figures are checked, so 100 is accepted only as the scale of a
 * score and never as a score in its own right.
 */
const SCORE_SCALE_PATTERN = /(\d+(?:\.\d+)?)\s*(?:out of|\/)\s*100(?![\d.,]*\d)/gi;

/**
 * Figures any statement, including a claim, may quote besides the facts it
 * cites: the score, its components and the data-quality ratios. None of
 * these has a code or id a claim could cite.
 */
function scoreNumbers(context: AiInterpretationContext): FactNumbers {
  const numbers = emptyNumbers();
  addValue(numbers, context.score.overallScore);
  for (const component of context.score.components) addValue(numbers, component.score);
  for (const value of Object.values(context.quality)) addValue(numbers, value);
  return numbers;
}

/**
 * Further figures narrative prose may quote: those in the supplied
 * limitations and the period, and simple counts of the facts (how many
 * metrics, findings and score dimensions there are).
 */
function proseNumbers(context: AiInterpretationContext): FactNumbers {
  const numbers = emptyNumbers();
  addText(numbers, context.currency, context.periodLabel?.text);
  addText(numbers, ...context.score.limitations, ...context.limitations);
  for (const component of context.score.components) addText(numbers, component.exclusionReason);

  const computed = context.metrics.filter(
    (metric) => metric.status === "COMPUTED" && metric.value !== null,
  ).length;
  const included = context.score.components.filter((component) => component.included).length;
  for (const count of [
    context.metrics.length,
    computed,
    context.metrics.length - computed,
    context.findings.length,
    context.score.components.length,
    included,
    context.score.components.length - included,
  ]) {
    numbers.exact.add(String(count));
  }
  return numbers;
}

/**
 * Wording an interpretation of diagnostic results must not use: it would
 * present the report as an audit, a credit rating or a solvency determination.
 */
const RESTRICTED_LANGUAGE: readonly RegExp[] = [
  /\binsolven(?:t|cy)\b/gi,
  /\bbankrupt(?:cy|cies)?\b/gi,
  /\bgoing[\s-]concern\b/gi,
  /\bcredit[\s-]?(?:rating|score|grade)s?\b/gi,
  /\bcredit[\s-]?worth(?:y|iness)\b/gi,
  /\binvestment[\s-]grade\b/gi,
  /\baudit(?:s|ed|ing|ors?)?\b/gi,
  /\b(?:un)?qualified opinion\b/gi,
  /\btrue and fair\b/gi,
  /\bcertif(?:y|ies|ied|ication)\b/gi,
  /\bguarantee[sd]?\b/gi,
  /\bfraud(?:ulent|ulently)?\b/gi,
  /\bmisconduct\b/gi,
];

function removeAll(text: string, fragments: readonly string[]): string {
  let out = text;
  for (const fragment of fragments) {
    if (fragment) out = out.replaceAll(fragment, " ");
  }
  return out;
}

function longestFirst(
  values: Iterable<string | null | undefined>,
  keep: (value: string) => boolean = () => true,
): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed && keep(trimmed)) unique.add(trimmed);
  }
  return [...unique].sort((a, b) => b.length - a.length);
}

type StatementScreen = { unsupportedNumbers: string[]; restrictedTerms: string[] };

type NarrativeSource = AiNarrative | { narrative: AiNarrative };

/**
 * Checks a whole narrative against the facts it was generated from.
 *
 * A claim is grounded only if all of the following hold:
 * - its references pass `checkClaimGrounding`;
 * - every figure in its text appears in a fact it cites, or in the score or
 *   data-quality facts. Signs are ignored, thousands separators and trailing
 *   zeros do not matter, and a computed value may be rounded to one or more
 *   decimal places. Anything else — a recomputed percentage, an invented
 *   amount, a value of a metric the claim does not cite — is reported as
 *   `UNSUPPORTED_NUMBER`;
 * - it uses no audit, credit-rating, insolvency or similar assurance wording
 *   (`RESTRICTED_LANGUAGE`). Text copied verbatim from a supplied finding or
 *   limitation is exempt, so "this score is not a credit rating" survives.
 *
 * The prose a reader sees (`summary` sentence by sentence, `keyObservations`,
 * `risks`, `limitations`) gets the figure and wording checks against all
 * facts, the supplied limitations and simple counts of the facts. Offending
 * statements are appended to `unsupportedClaims` with their `section`.
 * Nothing is removed from the narrative; callers must surface the flags.
 *
 * User notes never count as facts, so a figure that appears only in a note
 * is unsupported.
 *
 * The figure check is lexical. It establishes that a quoted figure exists
 * among the permitted facts, not that the sentence uses it correctly: a wrong
 * sign, or a small number that happens to equal another permitted fact
 * (a count, a quality ratio of 1), is not detected. Reviewers remain
 * responsible for the wording.
 */
export function checkNarrativeGrounding(
  result: NarrativeSource,
  context: AiInterpretationContext,
): GroundingCheckResult {
  const narrative = "narrative" in result ? result.narrative : result;
  const metricCodes = normalized(context.allowedMetricCodes);
  const findingIds = normalized(context.allowedFindingIds);

  const byMetric = new Map<string, FactNumbers>();
  for (const metric of context.metrics) {
    const numbers = byMetric.get(metric.code) ?? emptyNumbers();
    merge(numbers, metricNumbers(metric));
    byMetric.set(metric.code, numbers);
  }
  const byFinding = new Map<string, FactNumbers>();
  for (const finding of context.findings) byFinding.set(finding.id, findingNumbers(finding));

  const shared = scoreNumbers(context);
  const all = emptyNumbers();
  merge(all, shared);
  merge(all, proseNumbers(context));
  for (const numbers of byMetric.values()) merge(all, numbers);
  for (const numbers of byFinding.values()) merge(all, numbers);

  // Identifiers and names are not figures: "FY2025" quotes no number. A name
  // made only of digits and punctuation is not removed, so it cannot be used
  // to erase figures from the text being checked.
  const identifiers = longestFirst(
    [
      ...metricCodes,
      ...findingIds,
      ...context.findings.map((finding) => finding.ruleId),
      context.score.methodologyVersion,
      ...context.metrics.map((metric) => metric.periodLabel),
      context.periodLabel?.text,
      context.organizationName?.text,
    ],
    (value) => /\p{L}/u.test(value),
  );
  const approvedText = longestFirst([
    ...context.limitations,
    ...context.score.limitations,
    ...context.score.components.map((component) => component.exclusionReason),
    ...context.metrics.flatMap((metric) => metric.warnings),
    ...context.findings.flatMap((finding) => [
      finding.title,
      finding.explanation,
      finding.implication,
      finding.suggestedAction,
    ]),
  ]);

  const screen = (text: string, numbers: FactNumbers): StatementScreen => {
    const unsupportedNumbers = new Set<string>();
    const figures = removeAll(text, identifiers).replace(SCORE_SCALE_PATTERN, "$1");
    for (const token of figures.match(NUMBER_PATTERN) ?? []) {
      if (!isSupported(token, numbers)) unsupportedNumbers.add(token);
    }
    const restrictedTerms = new Set<string>();
    const unapproved = removeAll(text, approvedText);
    for (const pattern of RESTRICTED_LANGUAGE) {
      for (const match of unapproved.matchAll(pattern)) restrictedTerms.add(match[0].toLowerCase());
    }
    return { unsupportedNumbers: [...unsupportedNumbers], restrictedTerms: [...restrictedTerms] };
  };

  const flags = (screened: StatementScreen) => ({
    ...(screened.unsupportedNumbers.length
      ? { unsupportedNumbers: screened.unsupportedNumbers }
      : {}),
    ...(screened.restrictedTerms.length ? { restrictedTerms: screened.restrictedTerms } : {}),
  });

  const groundedClaims: AiClaim[] = [];
  const unsupportedClaims: UnsupportedClaim[] = [];

  for (const claim of narrative.claims) {
    const references = checkReferences(claim, metricCodes, findingIds);
    const citable = emptyNumbers();
    merge(citable, shared);
    for (const code of references.citedMetrics) merge(citable, byMetric.get(code));
    for (const id of references.citedFindings) merge(citable, byFinding.get(id));

    const screened = screen(claim.text, citable);
    const reasons = [...references.reasons];
    if (screened.unsupportedNumbers.length) {
      reasons.push("UNSUPPORTED_NUMBER");
      // A cited computed fact whose value is absent from the claim, while the
      // claim invents another figure, is a contradiction of diagnostics.
      const citedComputed = references.citedMetrics.some((code) => {
        const metric = context.metrics.find((m) => m.code === code);
        return metric?.status === "COMPUTED" && metric.value != null && metric.value !== "";
      });
      if (citedComputed && references.reasons.length === 0) {
        reasons.push("CONTRADICTORY_NUMBER");
      }
    }
    if (screened.restrictedTerms.length) reasons.push("RESTRICTED_LANGUAGE");

    if (reasons.length === 0) {
      groundedClaims.push(claim);
      continue;
    }
    unsupportedClaims.push({
      ...claim,
      reasons,
      unknownMetricCodes: references.unknownMetricCodes,
      unknownFindingIds: references.unknownFindingIds,
      ...flags(screened),
    });
  }

  const prose: Array<[NarrativeSection, readonly string[]]> = [
    ["summary", narrative.summary.split(/(?<=[.!?])\s+/u)],
    ["keyObservations", narrative.keyObservations],
    ["risks", narrative.risks],
    ["limitations", narrative.limitations],
  ];
  for (const [section, statements] of prose) {
    for (const statement of statements) {
      const text = statement.trim();
      if (!text) continue;
      const screened = screen(text, all);
      const reasons: UnsupportedClaimReason[] = [];
      if (screened.unsupportedNumbers.length) reasons.push("UNSUPPORTED_NUMBER");
      if (screened.restrictedTerms.length) reasons.push("RESTRICTED_LANGUAGE");
      if (reasons.length === 0) continue;
      unsupportedClaims.push({
        text,
        groundedMetricCodes: [],
        groundedFindingIds: [],
        reasons,
        unknownMetricCodes: [],
        unknownFindingIds: [],
        ...flags(screened),
        section,
      });
    }
  }

  return { groundedClaims, unsupportedClaims };
}
