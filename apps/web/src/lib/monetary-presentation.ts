/**
 * Presentation rules for extraction-line monetary amounts.
 * Uses backend review / mapping / scale-review fields as source of truth —
 * never treats high extraction confidence alone as confirmation.
 */

export type MonetaryLineInput = {
  concept: string;
  actualMonetaryValue?: string | null;
  currency?: string | null;
  quantityClass?: string | null;
  unitScaleRequiresReview?: boolean | null;
  reviewStatus: string;
  scaleConfidence?: string | null;
};

export type MonetaryPresentationKind =
  | "confirmed"
  | "provisional"
  | "undetermined"
  | "non_monetary";

export type MonetaryPresentation = {
  kind: MonetaryPresentationKind;
  /** Short heading for the amount field */
  fieldLabel: string;
  /** Primary amount text shown to the user */
  amountText: string;
  /** Whether this may be treated as an established NGN figure */
  isEstablished: boolean;
  /** Optional alert copy when the amount is not established */
  cautionTitle?: string;
  cautionBody?: string;
};

function isMonetaryQuantity(quantityClass: string | null | undefined): boolean {
  return !quantityClass || quantityClass === "MONETARY";
}

function hasReviewConfirmation(reviewStatus: string): boolean {
  return reviewStatus === "CONFIRMED" || reviewStatus === "CORRECTED";
}

function hasCandidateAmount(value: string | null | undefined): boolean {
  return value != null && String(value).trim() !== "";
}

/** Format backend numeric strings for display without changing the stored value. */
export function formatMonetaryDisplay(
  value: string,
  currency: string | null | undefined,
): string {
  const trimmed = value.trim();
  const asNumber = Number(trimmed);
  const formatted =
    Number.isFinite(asNumber) && /^-?\d+(\.\d+)?$/.test(trimmed)
      ? asNumber.toLocaleString("en-NG")
      : trimmed;
  const code = currency?.trim();
  return code ? `${code} ${formatted}` : formatted;
}

/**
 * Classify how an extraction line's monetary amount should appear in review UI.
 */
export function resolveMonetaryPresentation(line: MonetaryLineInput): MonetaryPresentation {
  if (!isMonetaryQuantity(line.quantityClass)) {
    return {
      kind: "non_monetary",
      fieldLabel: "Monetary amount",
      amountText: "Not applicable — non-monetary quantity",
      isEstablished: false,
      cautionTitle: "Non-monetary quantity",
      cautionBody: `This line is classified as ${line.quantityClass}. It must never appear as an NGN amount and is not scale-multiplied.`,
    };
  }

  const mapped = line.concept !== "UNMAPPED";
  const reviewed = hasReviewConfirmation(line.reviewStatus);
  // Match diagnostics: scale review is satisfied once the line is confirmed/corrected.
  const scaleSettled = !line.unitScaleRequiresReview || reviewed;
  const candidate = hasCandidateAmount(line.actualMonetaryValue);
  const candidateText = candidate
    ? formatMonetaryDisplay(String(line.actualMonetaryValue), line.currency)
    : null;

  if (mapped && reviewed && scaleSettled && candidate && candidateText) {
    return {
      kind: "confirmed",
      fieldLabel: "Confirmed monetary amount",
      amountText: candidateText,
      isEstablished: true,
    };
  }

  if (candidate && candidateText) {
    const reasons: string[] = [];
    if (!mapped) reasons.push("concept mapping is incomplete");
    if (line.unitScaleRequiresReview && !reviewed) {
      reasons.push("unit/scale confirmation is incomplete");
    }
    if (!reviewed) reasons.push("human review is incomplete");
    return {
      kind: "provisional",
      fieldLabel: "Provisional monetary amount",
      amountText: `Candidate ${candidateText}`,
      isEstablished: false,
      cautionTitle: "Not an established amount",
      cautionBody: `A calculated candidate exists, but ${reasons.join("; ")}. Do not treat this as a validated NGN figure yet. Source raw value and statement units are preserved above.`,
    };
  }

  return {
    kind: "undetermined",
    fieldLabel: "Monetary amount",
    amountText: "Undetermined — insufficient reliable information",
    isEstablished: false,
    cautionTitle: "Amount undetermined",
    cautionBody:
      "There is not enough reliable mapping, scale or numeric data to calculate a monetary amount. Original extracted values remain available above.",
  };
}
