import DecimalDefault from "decimal.js";

type DecimalInstance = {
  gt: (n: string | number | DecimalInstance) => boolean;
  gte: (n: string | number | DecimalInstance) => boolean;
  lt: (n: string | number | DecimalInstance) => boolean;
  lte: (n: string | number | DecimalInstance) => boolean;
  isZero: () => boolean;
  abs: () => DecimalInstance;
  plus: (n: string | number | DecimalInstance) => DecimalInstance;
  minus: (n: string | number | DecimalInstance) => DecimalInstance;
  mul: (n: string | number | DecimalInstance) => DecimalInstance;
  div: (n: string | number | DecimalInstance) => DecimalInstance;
  toFixed: (dp?: number) => string;
};

type DecimalConstructor = {
  new (value: string | number): DecimalInstance;
  set: (config: { precision?: number; rounding?: number }) => void;
  ROUND_HALF_UP: number;
};

const Decimal = DecimalDefault as unknown as DecimalConstructor;
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type { DecimalInstance as Decimal };

export function d(value: string | number | DecimalInstance): DecimalInstance {
  return typeof value === "object" && value !== null && "toFixed" in value
    ? value
    : new Decimal(value as string | number);
}

export function isPositive(value: DecimalInstance): boolean {
  return value.gt(0);
}

export function isZero(value: DecimalInstance): boolean {
  return value.isZero();
}

export function scaleFactor(unitScale: string): DecimalInstance | null {
  switch (unitScale) {
    case "ACTUAL":
      return d(1);
    case "THOUSANDS":
      return d(1000);
    case "MILLIONS":
      return d(1_000_000);
    default:
      return null;
  }
}

export function toPlain(value: DecimalInstance): string {
  return value.toFixed();
}
