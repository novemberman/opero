import { describe, expect, it } from "vitest";
import {
  formatMonetaryDisplay,
  resolveMonetaryPresentation,
} from "./monetary-presentation";

describe("monetary-presentation", () => {
  it("treats mapped + reviewed lines as confirmed monetary amounts", () => {
    const result = resolveMonetaryPresentation({
      concept: "REVENUE",
      actualMonetaryValue: "144000000",
      currency: "NGN",
      quantityClass: "MONETARY",
      unitScaleRequiresReview: false,
      reviewStatus: "CONFIRMED",
      scaleConfidence: "HIGH",
    });
    expect(result.kind).toBe("confirmed");
    expect(result.isEstablished).toBe(true);
    expect(result.amountText).toBe(formatMonetaryDisplay("144000000", "NGN"));
    expect(result.fieldLabel).toMatch(/confirmed/i);
  });

  it("does not treat high confidence alone as confirmation", () => {
    const result = resolveMonetaryPresentation({
      concept: "REVENUE",
      actualMonetaryValue: "144000000",
      currency: "NGN",
      quantityClass: "MONETARY",
      unitScaleRequiresReview: false,
      reviewStatus: "PENDING",
      scaleConfidence: "HIGH",
    });
    expect(result.kind).toBe("provisional");
    expect(result.isEstablished).toBe(false);
    expect(result.amountText).toMatch(/^Candidate /);
  });

  it("marks unmapped / ambiguous-scale candidates as provisional, not established NGN", () => {
    const result = resolveMonetaryPresentation({
      concept: "UNMAPPED",
      actualMonetaryValue: "12500000",
      currency: "NGN",
      quantityClass: "MONETARY",
      unitScaleRequiresReview: true,
      reviewStatus: "PENDING",
      scaleConfidence: "AMBIGUOUS",
    });
    expect(result.kind).toBe("provisional");
    expect(result.isEstablished).toBe(false);
    expect(result.amountText).toContain("Candidate");
    expect(result.amountText).toContain(formatMonetaryDisplay("12500000", "NGN"));
    expect(result.cautionBody).toMatch(/mapping|scale|review/i);
  });

  it("returns undetermined when no reliable monetary candidate exists", () => {
    const result = resolveMonetaryPresentation({
      concept: "COST_OF_SALES",
      actualMonetaryValue: null,
      currency: "NGN",
      quantityClass: "MONETARY",
      unitScaleRequiresReview: true,
      reviewStatus: "PENDING",
    });
    expect(result.kind).toBe("undetermined");
    expect(result.isEstablished).toBe(false);
    expect(result.amountText).toMatch(/undetermined/i);
  });

  it("never presents non-monetary quantities as NGN amounts", () => {
    const result = resolveMonetaryPresentation({
      concept: "UNMAPPED",
      actualMonetaryValue: null,
      currency: null,
      quantityClass: "PERCENTAGE",
      unitScaleRequiresReview: false,
      reviewStatus: "PENDING",
      scaleConfidence: "HIGH",
    });
    expect(result.kind).toBe("non_monetary");
    expect(result.isEstablished).toBe(false);
    expect(result.amountText).toMatch(/non-monetary/i);
    expect(result.amountText).not.toMatch(/NGN/i);
  });

  it("allows confirmed review to settle an otherwise review-required scale", () => {
    const result = resolveMonetaryPresentation({
      concept: "REVENUE",
      actualMonetaryValue: "5000000",
      currency: "NGN",
      quantityClass: "MONETARY",
      unitScaleRequiresReview: true,
      reviewStatus: "CONFIRMED",
    });
    expect(result.kind).toBe("confirmed");
    expect(result.isEstablished).toBe(true);
  });

  it("does not treat legacy CORRECTED alone as established", () => {
    const result = resolveMonetaryPresentation({
      concept: "REVENUE",
      actualMonetaryValue: "5000000",
      currency: "NGN",
      quantityClass: "MONETARY",
      unitScaleRequiresReview: false,
      reviewStatus: "CORRECTED",
    });
    expect(result.isEstablished).toBe(false);
  });
});

