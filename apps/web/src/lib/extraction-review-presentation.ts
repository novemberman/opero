/**
 * Presentation helpers for extraction review Stage A.
 * Client-side filtering/sorting/summary only — does not mutate records,
 * change REVIEW_REQUIRED rules, or feed diagnostics.
 */

export type ExtractionReviewLine = {
  id: string;
  concept: string;
  labelRaw: string;
  reviewStatus: string;
  quality: string;
  quantityClass?: string | null;
  unitScaleRequiresReview?: boolean | null;
  evidence?: unknown;
  rawValue?: string;
  normalizedValue?: string | null;
};

export const EXTRACTION_REVIEW_FILTERS = [
  "needs_financial_review",
  "scale_issues",
  "unmapped_monetary",
  "contextual",
  "all",
] as const;

export type ExtractionReviewFilterId = (typeof EXTRACTION_REVIEW_FILTERS)[number];

export const EXTRACTION_REVIEW_FILTER_LABELS: Record<ExtractionReviewFilterId, string> = {
  needs_financial_review: "Needs financial review",
  scale_issues: "Scale issues",
  unmapped_monetary: "Unmapped monetary",
  contextual: "Contextual / non-diagnostic",
  all: "All extracted items",
};

/** Default review queue: actionable pending monetary figures. */
export const DEFAULT_EXTRACTION_REVIEW_FILTER: ExtractionReviewFilterId =
  "needs_financial_review";

const NON_MONETARY = new Set([
  "PERCENTAGE",
  "RATIO",
  "DATE",
  "NOTE_NUMBER",
  "SHARE_COUNT",
  "OTHER",
]);

/**
 * Missing quantityClass is treated as MONETARY (pre-Phase-8 / API default).
 * Documented limitation: if the API ever omits class for a true non-monetary
 * line, it would appear in the monetary queue until class is present.
 */
export function isMonetaryQuantityClass(quantityClass: string | null | undefined): boolean {
  if (!quantityClass) return true;
  return quantityClass === "MONETARY";
}

export function isContextualQuantityClass(quantityClass: string | null | undefined): boolean {
  if (!quantityClass) return false;
  return quantityClass !== "MONETARY" && NON_MONETARY.has(quantityClass);
}

export function isPendingReview(status: string): boolean {
  return status === "PENDING";
}

export function isConfirmedReview(status: string): boolean {
  return status === "CONFIRMED" || status === "CORRECTED";
}

export function isRejectedReview(status: string): boolean {
  return status === "REJECTED";
}

export function isMappedConcept(concept: string): boolean {
  return concept !== "UNMAPPED";
}

export type ExtractionReviewSummary = {
  total: number;
  pendingMonetary: number;
  mappedMonetary: number;
  unmappedMonetary: number;
  scaleConfirmationRequired: number;
  contextualNonMonetary: number;
  confirmed: number;
  rejected: number;
  /** Pending lines of any quantity class (informational; not a filter default). */
  pendingAll: number;
};

export function summarizeExtractionReview(
  lines: readonly ExtractionReviewLine[],
): ExtractionReviewSummary {
  let pendingMonetary = 0;
  let mappedMonetary = 0;
  let unmappedMonetary = 0;
  let scaleConfirmationRequired = 0;
  let contextualNonMonetary = 0;
  let confirmed = 0;
  let rejected = 0;
  let pendingAll = 0;

  for (const line of lines) {
    const monetary = isMonetaryQuantityClass(line.quantityClass);
    if (isPendingReview(line.reviewStatus)) pendingAll += 1;
    if (isConfirmedReview(line.reviewStatus)) confirmed += 1;
    if (isRejectedReview(line.reviewStatus)) rejected += 1;

    if (!monetary) {
      contextualNonMonetary += 1;
      continue;
    }

    if (isMappedConcept(line.concept)) mappedMonetary += 1;
    else unmappedMonetary += 1;

    if (isPendingReview(line.reviewStatus)) pendingMonetary += 1;
    if (line.unitScaleRequiresReview) scaleConfirmationRequired += 1;
  }

  return {
    total: lines.length,
    pendingMonetary,
    mappedMonetary,
    unmappedMonetary,
    scaleConfirmationRequired,
    contextualNonMonetary,
    confirmed,
    rejected,
    pendingAll,
  };
}

export function lineMatchesExtractionReviewFilter(
  line: ExtractionReviewLine,
  filter: ExtractionReviewFilterId,
): boolean {
  const monetary = isMonetaryQuantityClass(line.quantityClass);

  switch (filter) {
    case "needs_financial_review":
      return monetary && isPendingReview(line.reviewStatus);
    case "scale_issues":
      return monetary && Boolean(line.unitScaleRequiresReview);
    case "unmapped_monetary":
      return monetary && !isMappedConcept(line.concept);
    case "contextual":
      return !monetary;
    case "all":
      return true;
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

export function filterExtractionReviewLines<T extends ExtractionReviewLine>(
  lines: readonly T[],
  filter: ExtractionReviewFilterId,
): T[] {
  return lines.filter((line) => lineMatchesExtractionReviewFilter(line, filter));
}

/**
 * Priority for financial review:
 * 1. Pending mapped monetary (scale issues first)
 * 2. Pending unmapped / low-quality monetary
 * 3. Other monetary
 * 4. Contextual / non-monetary last
 */
export function extractionReviewPriorityScore(line: ExtractionReviewLine): number {
  const monetary = isMonetaryQuantityClass(line.quantityClass);
  const pending = isPendingReview(line.reviewStatus);
  const mapped = isMappedConcept(line.concept);
  let score = 0;

  if (!monetary) {
    // Contextual stays accessible via filter but never leads the financial queue.
    return pending ? 10 : 0;
  }

  score += 1000;
  // Mapped pending confirmation first; then unmapped / ambiguous monetary.
  if (pending && mapped) score += 400;
  else if (pending && !mapped) score += 200;
  else if (pending) score += 150;

  // Within a band, scale ambiguity and low quality surface next.
  if (line.unitScaleRequiresReview) score += 100;
  if (line.quality === "LOW" || line.quality === "MANUAL") score += 25;
  if (isConfirmedReview(line.reviewStatus)) score -= 40;
  if (isRejectedReview(line.reviewStatus)) score -= 50;

  return score;
}

export function sortExtractionReviewLines<T extends ExtractionReviewLine>(
  lines: readonly T[],
): T[] {
  return [...lines].sort((a, b) => {
    const diff = extractionReviewPriorityScore(b) - extractionReviewPriorityScore(a);
    if (diff !== 0) return diff;
    return a.labelRaw.localeCompare(b.labelRaw);
  });
}

export function selectExtractionReviewLines<T extends ExtractionReviewLine>(
  lines: readonly T[],
  filter: ExtractionReviewFilterId = DEFAULT_EXTRACTION_REVIEW_FILTER,
): T[] {
  return sortExtractionReviewLines(filterExtractionReviewLines(lines, filter));
}

export function filterCount(
  lines: readonly ExtractionReviewLine[],
  filter: ExtractionReviewFilterId,
): number {
  return filterExtractionReviewLines(lines, filter).length;
}
