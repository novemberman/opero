import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXTRACTION_REVIEW_FILTER,
  filterExtractionReviewLines,
  hasSoftScaleConfidence,
  isContextualQuantityClass,
  isMonetaryQuantityClass,
  lineMatchesExtractionReviewFilter,
  selectExtractionReviewLines,
  sortExtractionReviewLines,
  summarizeExtractionReview,
  type ExtractionReviewLine,
} from "./extraction-review-presentation";

function line(partial: Partial<ExtractionReviewLine> & Pick<ExtractionReviewLine, "id" | "labelRaw">): ExtractionReviewLine {
  return {
    concept: "REVENUE",
    reviewStatus: "PENDING",
    quality: "HIGH",
    quantityClass: "MONETARY",
    unitScaleRequiresReview: false,
    scaleConfidence: "HIGH",
    evidence: { evidenceKey: "ev-preserve" },
    rawValue: "1",
    normalizedValue: "1",
    ...partial,
  };
}

const fixture: ExtractionReviewLine[] = [
  line({
    id: "rev",
    labelRaw: "Revenue",
    concept: "REVENUE",
    reviewStatus: "PENDING",
    quantityClass: "MONETARY",
  }),
  line({
    id: "other",
    labelRaw: "Other income",
    concept: "UNMAPPED",
    reviewStatus: "PENDING",
    quantityClass: "MONETARY",
    unitScaleRequiresReview: true,
    scaleConfidence: "AMBIGUOUS",
    quality: "LOW",
  }),
  line({
    id: "med-scale",
    labelRaw: "Operating profit",
    concept: "OPERATING_PROFIT",
    reviewStatus: "PENDING",
    quantityClass: "MONETARY",
    unitScaleRequiresReview: false,
    scaleConfidence: "MEDIUM",
  }),
  line({
    id: "margin",
    labelRaw: "Gross profit margin",
    concept: "UNMAPPED",
    reviewStatus: "PENDING",
    quantityClass: "PERCENTAGE",
  }),
  line({
    id: "fy",
    labelRaw: "Year ended 31 December",
    concept: "UNMAPPED",
    reviewStatus: "PENDING",
    quantityClass: "DATE",
  }),
  line({
    id: "ratio",
    labelRaw: "Current ratio",
    concept: "UNMAPPED",
    reviewStatus: "PENDING",
    quantityClass: "RATIO",
  }),
  line({
    id: "note",
    labelRaw: "Note 1",
    concept: "UNMAPPED",
    reviewStatus: "PENDING",
    quantityClass: "NOTE_NUMBER",
  }),
  line({
    id: "cogs",
    labelRaw: "Cost of sales",
    concept: "COST_OF_GOODS_SOLD",
    reviewStatus: "CONFIRMED",
    quantityClass: "MONETARY",
  }),
  line({
    id: "junk",
    labelRaw: "Rejected noise",
    concept: "UNMAPPED",
    reviewStatus: "REJECTED",
    quantityClass: "MONETARY",
  }),
  line({
    id: "legacy",
    labelRaw: "Legacy line without quantityClass",
    concept: "NET_PROFIT",
    reviewStatus: "PENDING",
    quantityClass: undefined,
  }),
];

describe("extraction-review-presentation", () => {
  it("defaults missing quantityClass to monetary (API limitation documented)", () => {
    expect(isMonetaryQuantityClass(undefined)).toBe(true);
    expect(isMonetaryQuantityClass(null)).toBe(true);
    expect(isMonetaryQuantityClass("PERCENTAGE")).toBe(false);
    expect(isContextualQuantityClass("DATE")).toBe(true);
    expect(isContextualQuantityClass("MONETARY")).toBe(false);
  });

  it("summarizes pending/mapped/unmapped monetary, scale, contextual, confirmed and rejected", () => {
    const summary = summarizeExtractionReview(fixture);
    expect(summary.total).toBe(10);
    expect(summary.pendingMonetary).toBe(4); // rev, other, med-scale, legacy
    expect(summary.mappedMonetary).toBe(4); // rev, med-scale, cogs, legacy
    expect(summary.unmappedMonetary).toBe(2); // other, junk
    expect(summary.scaleConfirmationRequired).toBe(1);
    // Soft confidence attention stays separate from mandatory scale confirmation.
    expect(summary.scaleConfidenceAttention).toBe(2); // other AMBIGUOUS + med-scale MEDIUM
    expect(summary.contextualNonMonetary).toBe(4); // margin, fy, ratio, note
    expect(summary.confirmed).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.pendingAll).toBe(8);
  });

  it("keeps soft scale confidence distinct from mandatory scale review", () => {
    expect(hasSoftScaleConfidence("MEDIUM")).toBe(true);
    expect(hasSoftScaleConfidence("HIGH")).toBe(false);
    expect(filterExtractionReviewLines(fixture, "scale_issues").map((l) => l.id)).toEqual([
      "other",
    ]);
    expect(
      filterExtractionReviewLines(fixture, "scale_issues").every((l) => l.unitScaleRequiresReview),
    ).toBe(true);
  });

  it("defaults the financial review filter to pending monetary only", () => {
    expect(DEFAULT_EXTRACTION_REVIEW_FILTER).toBe("needs_financial_review");
    const filtered = filterExtractionReviewLines(fixture, "needs_financial_review");
    expect(filtered.map((l) => l.id).sort()).toEqual(["legacy", "med-scale", "other", "rev"]);
    expect(filtered.every((l) => l.reviewStatus === "PENDING")).toBe(true);
    expect(filtered.every((l) => isMonetaryQuantityClass(l.quantityClass))).toBe(true);
  });

  it("excludes non-monetary quantities from the default financial queue", () => {
    const filtered = filterExtractionReviewLines(fixture, "needs_financial_review");
    expect(filtered.some((l) => l.quantityClass === "PERCENTAGE")).toBe(false);
    expect(filtered.some((l) => l.quantityClass === "DATE")).toBe(false);
    expect(filtered.some((l) => l.quantityClass === "RATIO")).toBe(false);
    expect(filtered.some((l) => l.quantityClass === "NOTE_NUMBER")).toBe(false);
  });

  it("supports scale, unmapped monetary, contextual and all filters", () => {
    expect(filterExtractionReviewLines(fixture, "scale_issues").map((l) => l.id)).toEqual([
      "other",
    ]);
    expect(
      filterExtractionReviewLines(fixture, "unmapped_monetary")
        .map((l) => l.id)
        .sort(),
    ).toEqual(["junk", "other"]);
    expect(
      filterExtractionReviewLines(fixture, "contextual")
        .map((l) => l.quantityClass)
        .sort(),
    ).toEqual(["DATE", "NOTE_NUMBER", "PERCENTAGE", "RATIO"]);
    expect(filterExtractionReviewLines(fixture, "all")).toHaveLength(10);
  });

  it("prioritizes mapped pending monetary before unmapped monetary; contextual last", () => {
    const sorted = sortExtractionReviewLines(fixture);
    const ids = sorted.map((l) => l.id);
    const revIdx = ids.indexOf("rev");
    const otherIdx = ids.indexOf("other");
    const marginIdx = ids.indexOf("margin");
    expect(revIdx).toBeLessThan(otherIdx);
    expect(otherIdx).toBeLessThan(marginIdx);
    expect(ids.indexOf("cogs")).toBeGreaterThan(otherIdx);
  });

  it("selectExtractionReviewLines applies default filter then sort", () => {
    const selected = selectExtractionReviewLines(fixture);
    expect(selected.every((l) => lineMatchesExtractionReviewFilter(l, "needs_financial_review"))).toBe(
      true,
    );
    expect(selected[0]?.concept).not.toBe("UNMAPPED");
  });

  it("preserves evidence and raw fields on filtered lines (no mutation)", () => {
    const original = fixture[0]!;
    const evidenceRef = original.evidence;
    const selected = selectExtractionReviewLines(fixture, "all");
    const again = selected.find((l) => l.id === "rev");
    expect(again?.evidence).toBe(evidenceRef);
    expect(again?.rawValue).toBe("1");
    expect(original.reviewStatus).toBe("PENDING");
  });

  it("keeps confirmed and rejected out of the default pending monetary queue", () => {
    const filtered = filterExtractionReviewLines(fixture, "needs_financial_review");
    expect(filtered.some((l) => l.reviewStatus === "CONFIRMED")).toBe(false);
    expect(filtered.some((l) => l.reviewStatus === "REJECTED")).toBe(false);
  });
});
