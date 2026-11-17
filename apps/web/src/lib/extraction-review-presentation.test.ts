import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXTRACTION_REVIEW_FILTER,
  FINANCIAL_CONCEPT_DISPLAY_LABELS,
  filterExtractionReviewLines,
  formatFinancialConceptLabel,
  hasSoftScaleConfidence,
  isContextualQuantityClass,
  isMappedConcept,
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
    id: "legacy-corrected",
    labelRaw: "Legacy corrected revenue",
    concept: "REVENUE",
    reviewStatus: "CORRECTED",
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
    expect(summary.total).toBe(11);
    expect(summary.pendingMonetary).toBe(5); // rev, other, med-scale, legacy, legacy-corrected
    expect(summary.mappedMonetary).toBe(5); // rev, med-scale, cogs, legacy, legacy-corrected
    expect(summary.unmappedMonetary).toBe(2); // other, junk
    expect(summary.scaleConfirmationRequired).toBe(1);
    // Soft confidence attention stays separate from mandatory scale confirmation.
    expect(summary.scaleConfidenceAttention).toBe(2); // other AMBIGUOUS + med-scale MEDIUM
    expect(summary.contextualNonMonetary).toBe(4); // margin, fy, ratio, note
    expect(summary.confirmed).toBe(1); // CONFIRMED only — CORRECTED is not confirmed
    expect(summary.rejected).toBe(1);
    expect(summary.pendingAll).toBe(9);
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

  it("defaults the inventory filter to All figures so confirmed rows stay visible", () => {
    expect(DEFAULT_EXTRACTION_REVIEW_FILTER).toBe("all");
    expect(filterExtractionReviewLines(fixture, "all")).toHaveLength(11);
    expect(filterExtractionReviewLines(fixture, "all").some((l) => l.reviewStatus === "CONFIRMED")).toBe(
      true,
    );
  });

  it("keeps Pending review as the actionable monetary queue (excludes CONFIRMED)", () => {
    const filtered = filterExtractionReviewLines(fixture, "needs_financial_review");
    expect(filtered.map((l) => l.id).sort()).toEqual([
      "legacy",
      "legacy-corrected",
      "med-scale",
      "other",
      "rev",
    ]);
    expect(
      filtered.every((l) => l.reviewStatus === "PENDING" || l.reviewStatus === "CORRECTED"),
    ).toBe(true);
    expect(filtered.every((l) => isMonetaryQuantityClass(l.quantityClass))).toBe(true);
    expect(filtered.some((l) => l.reviewStatus === "CONFIRMED")).toBe(false);
  });

  it("excludes non-monetary quantities from the Pending review queue", () => {
    const filtered = filterExtractionReviewLines(fixture, "needs_financial_review");
    expect(filtered.some((l) => l.quantityClass === "PERCENTAGE")).toBe(false);
    expect(filtered.some((l) => l.quantityClass === "DATE")).toBe(false);
    expect(filtered.some((l) => l.quantityClass === "RATIO")).toBe(false);
    expect(filtered.some((l) => l.quantityClass === "NOTE_NUMBER")).toBe(false);
  });

  it("supports confirmed, scale, unmapped monetary, contextual and all filters", () => {
    expect(filterExtractionReviewLines(fixture, "confirmed").map((l) => l.id)).toEqual(["cogs"]);
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
    expect(filterExtractionReviewLines(fixture, "all")).toHaveLength(11);
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

  it("selectExtractionReviewLines applies default All filter then sort", () => {
    const selected = selectExtractionReviewLines(fixture);
    expect(selected).toHaveLength(11);
    expect(selected.every((l) => lineMatchesExtractionReviewFilter(l, "all"))).toBe(true);
    expect(selected.some((l) => l.reviewStatus === "CONFIRMED")).toBe(true);
  });

  it("confirming a figure reduces pending count without changing total inventory", () => {
    const before = summarizeExtractionReview(fixture);
    const afterConfirm = fixture.map((line) =>
      line.id === "rev" ? { ...line, reviewStatus: "CONFIRMED", unitScaleRequiresReview: false } : line,
    );
    const after = summarizeExtractionReview(afterConfirm);
    expect(after.total).toBe(before.total);
    expect(after.pendingMonetary).toBe(before.pendingMonetary - 1);
    expect(after.confirmed).toBe(before.confirmed + 1);
    expect(filterExtractionReviewLines(afterConfirm, "all").map((l) => l.id)).toContain("rev");
    expect(filterExtractionReviewLines(afterConfirm, "confirmed").map((l) => l.id)).toContain("rev");
    expect(filterExtractionReviewLines(afterConfirm, "needs_financial_review").map((l) => l.id)).not.toContain(
      "rev",
    );
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

  it("provides readable labels for B2.2 Increment A and B1 concepts without renaming enums", () => {
    const labels: Array<[string, string]> = [
      ["PROFIT_BEFORE_TAX", "Profit before tax"],
      ["INCOME_TAX_EXPENSE", "Income tax expense"],
      ["OPENING_CASH_AND_EQUIVALENTS", "Opening cash and equivalents"],
      ["INVESTING_CASH_FLOW", "Investing cash flow"],
      ["FINANCING_CASH_FLOW", "Financing cash flow"],
      ["NET_CHANGE_IN_CASH", "Net change in cash"],
      ["SHARE_CAPITAL", "Share capital"],
      ["RETAINED_EARNINGS", "Retained earnings"],
      ["TAX_PAYABLE", "Tax payable"],
      ["TOTAL_LIABILITIES_AND_EQUITY", "Total liabilities and equity"],
    ];
    for (const [concept, label] of labels) {
      expect(FINANCIAL_CONCEPT_DISPLAY_LABELS[concept]).toBe(label);
      expect(formatFinancialConceptLabel(concept)).toBe(label);
      // Enum identity stays on the record; presentation never rewrites it.
      expect(concept).not.toBe(label);
    }
    expect(formatFinancialConceptLabel("NET_PROFIT")).toBe("Net profit");
    expect(formatFinancialConceptLabel("UNKNOWN_FUTURE_CONCEPT")).toBe("UNKNOWN_FUTURE_CONCEPT");
  });

  it("treats Increment A mapped concepts as mapped pending monetary in the review queue", () => {
    const pbt = line({
      id: "pbt",
      labelRaw: "Profit before tax",
      concept: "PROFIT_BEFORE_TAX",
      reviewStatus: "PENDING",
      quantityClass: "MONETARY",
    });
    expect(isMappedConcept(pbt.concept)).toBe(true);
    expect(lineMatchesExtractionReviewFilter(pbt, "needs_financial_review")).toBe(true);
    expect(lineMatchesExtractionReviewFilter(pbt, "unmapped_monetary")).toBe(false);
    expect(pbt.reviewStatus).toBe("PENDING");
    expect(pbt.concept).toBe("PROFIT_BEFORE_TAX");
  });
});
