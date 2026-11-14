/**
 * Classify extracted numbers so percentages, ratios, dates, and share counts
 * are never treated as monetary statement figures.
 */

export const QUANTITY_CLASSES = [
  "MONETARY",
  "PERCENTAGE",
  "RATIO",
  "DATE",
  "NOTE_NUMBER",
  "SHARE_COUNT",
  "OTHER",
] as const;

export type QuantityClassId = (typeof QUANTITY_CLASSES)[number];

const PERCENT_LABEL =
  /\b(margin|percentage|percent|growth|yoy|cagr|rate of|%\s*of|as a %|as a percent)\b/i;
const RATIO_LABEL =
  /\b(ratio|multiple|turnover days|days sales|coverage|times|x\b|gearing)\b/i;
const SHARE_LABEL = /\b(shares?\s+outstanding|number of shares|share count|ordinary shares)\b/i;
const NOTE_LABEL = /^(note|notes)\s*\d+$/i;
const DATE_LABEL =
  /\b(year ended|period ended|as at|as of|dated|financial year|fy\s*\d{4}|31\s+december|december\s+\d{1,2})\b/i;

export function classifyQuantity(input: {
  label: string;
  rawValue: string;
}): { quantityClass: QuantityClassId; reason: string } {
  const label = input.label.replace(/\s+/g, " ").trim();
  const raw = input.rawValue.trim();

  if (/%\s*$/.test(raw) || /^-?\d+(\.\d+)?\s*%$/.test(raw)) {
    return { quantityClass: "PERCENTAGE", reason: "Value includes a percent sign" };
  }
  if (PERCENT_LABEL.test(label) && !/\b(profit|income|revenue|sales|turnover)\b/i.test(label)) {
    return { quantityClass: "PERCENTAGE", reason: "Label indicates a percentage metric" };
  }
  // "Gross margin 60%" style — margin without absolute profit wording.
  if (/\bgross\s+margin\b/i.test(label) && !/\bgross\s+profit\b/i.test(label)) {
    return { quantityClass: "PERCENTAGE", reason: "Gross margin is a percentage, not gross profit" };
  }
  if (/\bnet\s+(profit\s+)?margin\b/i.test(label)) {
    return { quantityClass: "PERCENTAGE", reason: "Net margin is a percentage metric" };
  }

  if (RATIO_LABEL.test(label) || /\bcurrent\s+ratio\b/i.test(label)) {
    return { quantityClass: "RATIO", reason: "Label indicates a financial ratio" };
  }

  if (SHARE_LABEL.test(label)) {
    return { quantityClass: "SHARE_COUNT", reason: "Label indicates share counts" };
  }

  if (NOTE_LABEL.test(label) || (/^note\b/i.test(label) && /^\d{1,3}$/.test(raw.replace(/[.,]/g, "")))) {
    return { quantityClass: "NOTE_NUMBER", reason: "Looks like a note reference" };
  }

  if (
    DATE_LABEL.test(label) ||
    DATE_LABEL.test(raw) ||
    /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(raw) ||
    /^(19|20)\d{2}$/.test(raw)
  ) {
    // Bare years on monetary lines (e.g. column headers) are dates/periods.
    if (/^(19|20)\d{2}$/.test(raw) || DATE_LABEL.test(label) || DATE_LABEL.test(raw)) {
      return { quantityClass: "DATE", reason: "Value or label looks like a date / financial year" };
    }
  }

  return { quantityClass: "MONETARY", reason: "Treated as a monetary amount" };
}

/** True when the quantity may enter monetary diagnostics after review/normalization. */
export function isMonetaryQuantity(quantityClass: QuantityClassId): boolean {
  return quantityClass === "MONETARY";
}
