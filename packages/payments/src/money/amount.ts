/** Opero stores money as integer minor units (kobo for NGN). */

export const NGN = "NGN" as const;

export type CurrencyCode = typeof NGN | string;

/** Korapay documents amounts in major currency units (naira), not kobo. */
export function minorToMajorUnits(amountMinor: number, currency: string): number {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new Error("amountMinor must be a non-negative integer");
  }
  if (currency.toUpperCase() === "NGN") {
    return amountMinor / 100;
  }
  // Default ISO-4217 exponent 2 until additional currencies are launched.
  return amountMinor / 100;
}

export function majorToMinorUnits(amountMajor: number, currency: string): number {
  if (!Number.isFinite(amountMajor) || amountMajor < 0) {
    throw new Error("amountMajor must be a non-negative finite number");
  }
  const factor = currency.toUpperCase() === "NGN" ? 100 : 100;
  return Math.round(amountMajor * factor);
}

export function formatNgnFromMinor(amountMinor: number): string {
  const major = minorToMajorUnits(amountMinor, "NGN");
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(major);
}
