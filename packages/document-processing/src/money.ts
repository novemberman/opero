import DecimalDefault from "decimal.js";

type DecimalInstance = {
  isFinite: () => boolean;
  negated: () => { toFixed: (dp?: number) => string };
  toFixed: (dp?: number) => string;
};

type DecimalConstructor = {
  new (value: string | number): DecimalInstance;
  set: (config: { precision?: number; rounding?: number }) => void;
  ROUND_HALF_UP: number;
};

const Decimal = DecimalDefault as unknown as DecimalConstructor;
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/**
 * Parse common financial number formats into a decimal string.
 * Returns null when the value cannot be interpreted safely.
 */
export function parseFinancialNumber(raw: string): string | null {
  let value = raw.trim();
  if (!value) {
    return null;
  }

  let negative = false;
  if (value.includes("$")) {
    value = value.replaceAll("$", "");
  }
  if (value.startsWith("(") && value.endsWith(")")) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (value.endsWith("-")) {
    negative = true;
    value = value.slice(0, -1);
  }
  if (value.startsWith("-")) {
    negative = true;
    value = value.slice(1);
  }
  value = value.replace(/\s+/g, "").replace(/,/g, "").replace(/cr$/i, "").replace(/dr$/i, "");
  if (!/^\d+(\.\d+)?$/.test(value)) {
    return null;
  }

  try {
    const decimal = new Decimal(value);
    if (!decimal.isFinite()) {
      return null;
    }
    const signed = negative ? decimal.negated() : decimal;
    return signed.toFixed();
  } catch {
    return null;
  }
}

export function assertSameCurrency(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) {
    return true;
  }
  return a.toUpperCase() === b.toUpperCase();
}

/** Neutralize spreadsheet-formula-like strings so they are never executed. */
export function neutralizeFormulaLike(value: string): string {
  if (/^[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}
