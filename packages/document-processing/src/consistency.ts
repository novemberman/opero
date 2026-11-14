import DecimalDefault from "decimal.js";
import type { FinancialConceptId } from "./concepts.js";

type DecimalInstance = {
  abs: () => DecimalInstance;
  plus: (n: string | number | DecimalInstance) => DecimalInstance;
  minus: (n: string | number | DecimalInstance) => DecimalInstance;
  mul: (n: string | number | DecimalInstance) => DecimalInstance;
  lte: (n: string | number | DecimalInstance) => boolean;
  toFixed: (dp?: number) => string;
};

type DecimalConstructor = {
  new (value: string | number): DecimalInstance;
  set: (config: { precision?: number; rounding?: number }) => void;
  ROUND_HALF_UP: number;
};

const Decimal = DecimalDefault as unknown as DecimalConstructor;
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type ConsistencyStatus =
  | "CONSISTENT"
  | "INCONSISTENT"
  | "INSUFFICIENT_EVIDENCE"
  | "REQUIRES_REVIEW";

export type ConsistencyFinding = {
  code: string;
  status: ConsistencyStatus;
  message: string;
  concepts: FinancialConceptId[];
};

export type ConsistencyLine = {
  concept: FinancialConceptId;
  /** Raw normalized figure BEFORE unit-scale multiplication (statement units). */
  normalizedValue: string | null;
  unitScale: "ACTUAL" | "THOUSANDS" | "MILLIONS";
  quantityClass?: string;
  currency?: string | null;
  periodLabel?: string | null;
  reviewStatus?: string;
};

function scaleFactor(unitScale: ConsistencyLine["unitScale"]): DecimalInstance {
  switch (unitScale) {
    case "THOUSANDS":
      return new Decimal(1000);
    case "MILLIONS":
      return new Decimal(1_000_000);
    default:
      return new Decimal(1);
  }
}

function actualOf(line: ConsistencyLine): DecimalInstance | null {
  if (!line.normalizedValue) return null;
  if (line.quantityClass && line.quantityClass !== "MONETARY") return null;
  try {
    return new Decimal(line.normalizedValue).mul(scaleFactor(line.unitScale));
  } catch {
    return null;
  }
}

function pick(
  lines: ConsistencyLine[],
  concept: FinancialConceptId,
): ConsistencyLine | null {
  const matches = lines.filter((l) => l.concept === concept && l.normalizedValue);
  if (!matches.length) return null;
  const preferred = matches.find(
    (m) => m.reviewStatus === "CONFIRMED" || m.reviewStatus === "CORRECTED",
  );
  return preferred ?? matches[0]!;
}

function withinTolerance(a: DecimalInstance, b: DecimalInstance): boolean {
  const tol = a.abs().mul("0.005").plus(1); // 0.5% + 1 currency unit
  return a.minus(b).abs().lte(tol);
}

/**
 * Deterministic accounting relationship checks. Never fabricates missing values.
 */
export function checkFinancialConsistency(lines: ConsistencyLine[]): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];
  const currencies = new Set(lines.map((l) => l.currency).filter(Boolean));
  if (currencies.size > 1) {
    findings.push({
      code: "MIXED_CURRENCY",
      status: "REQUIRES_REVIEW",
      message: "Multiple currencies present; consistency checks deferred",
      concepts: [],
    });
    return findings;
  }

  const assets = pick(lines, "TOTAL_ASSETS");
  const liabilities = pick(lines, "TOTAL_LIABILITIES");
  const equity = pick(lines, "EQUITY");
  if (!assets || !liabilities || !equity) {
    findings.push({
      code: "BALANCE_SHEET_IDENTITY",
      status: "INSUFFICIENT_EVIDENCE",
      message: "Need total assets, total liabilities and equity to validate A = L + E",
      concepts: ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "EQUITY"],
    });
  } else {
    const a = actualOf(assets);
    const l = actualOf(liabilities);
    const e = actualOf(equity);
    if (!a || !l || !e) {
      findings.push({
        code: "BALANCE_SHEET_IDENTITY",
        status: "INSUFFICIENT_EVIDENCE",
        message: "Balance sheet identity inputs are not usable monetary amounts",
        concepts: ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "EQUITY"],
      });
    } else {
      const rhs = l.plus(e);
      findings.push({
        code: "BALANCE_SHEET_IDENTITY",
        status: withinTolerance(a, rhs) ? "CONSISTENT" : "INCONSISTENT",
        message: withinTolerance(a, rhs)
          ? "Total assets reconcile with liabilities + equity"
          : `Total assets (${a.toFixed()}) do not reconcile with liabilities + equity (${rhs.toFixed()})`,
        concepts: ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "EQUITY"],
      });
    }
  }

  const revenue = pick(lines, "REVENUE");
  const cogs = pick(lines, "COST_OF_GOODS_SOLD");
  const gross = pick(lines, "GROSS_PROFIT");
  if (revenue && cogs && gross) {
    const r = actualOf(revenue);
    const c = actualOf(cogs);
    const g = actualOf(gross);
    if (r && c && g) {
      const derived = r.minus(c);
      findings.push({
        code: "GROSS_PROFIT_IDENTITY",
        status: withinTolerance(derived, g) ? "CONSISTENT" : "INCONSISTENT",
        message: withinTolerance(derived, g)
          ? "Gross profit reconciles with revenue − cost of sales"
          : `Gross profit (${g.toFixed()}) does not match revenue − COGS (${derived.toFixed()})`,
        concepts: ["REVENUE", "COST_OF_GOODS_SOLD", "GROSS_PROFIT"],
      });
    }
  } else {
    findings.push({
      code: "GROSS_PROFIT_IDENTITY",
      status: "INSUFFICIENT_EVIDENCE",
      message: "Need revenue, cost of sales and gross profit for margin identity",
      concepts: ["REVENUE", "COST_OF_GOODS_SOLD", "GROSS_PROFIT"],
    });
  }

  const ca = pick(lines, "CURRENT_ASSETS");
  const cl = pick(lines, "CURRENT_LIABILITIES");
  if (ca && cl) {
    const a = actualOf(ca);
    const l = actualOf(cl);
    if (a && l) {
      findings.push({
        code: "CURRENT_RATIO_INPUTS",
        status: "CONSISTENT",
        message: "Current assets and current liabilities are both present for liquidity checks",
        concepts: ["CURRENT_ASSETS", "CURRENT_LIABILITIES"],
      });
    }
  } else {
    findings.push({
      code: "CURRENT_RATIO_INPUTS",
      status: "INSUFFICIENT_EVIDENCE",
      message: "Current assets and/or current liabilities missing",
      concepts: ["CURRENT_ASSETS", "CURRENT_LIABILITIES"],
    });
  }

  const ocf = pick(lines, "OPERATING_CASH_FLOW");
  if (!ocf) {
    findings.push({
      code: "CASH_FLOW_MOVEMENT",
      status: "INSUFFICIENT_EVIDENCE",
      message:
        "Opening/closing cash movement cannot be validated without operating cash flow and cash balances across periods",
      concepts: ["OPERATING_CASH_FLOW", "CASH_AND_EQUIVALENTS"],
    });
  }

  return findings;
}
