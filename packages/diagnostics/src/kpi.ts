import { amountsByPeriod, periodDays, periodsAreComparable, resolveConcept } from "./concepts.js";
import { d, isPositive, isZero, toPlain } from "./decimal.js";
import type { DiagnosticSnapshot, MetricResult, MetricStatus, ScoreDimension } from "./types.js";

function metric(partial: Omit<MetricResult, "warnings"> & { warnings?: string[] }): MetricResult {
  return { warnings: partial.warnings ?? [], ...partial };
}

function fail(
  code: string,
  label: string,
  dimension: ScoreDimension,
  formulaId: string,
  status: MetricStatus,
  inputRefs: string[],
  warnings: string[] = [],
): MetricResult {
  return metric({
    code,
    label,
    dimension,
    status,
    value: null,
    unit: null,
    formulaId,
    periodStart: null,
    periodEnd: null,
    periodLabel: null,
    inputRefs,
    warnings,
  });
}

function ratioOrUndefined(
  numerator: ReturnType<typeof resolveConcept>,
  denominator: ReturnType<typeof resolveConcept>,
  opts: {
    code: string;
    label: string;
    dimension: ScoreDimension;
    formulaId: string;
    unit?: string;
    allowNegDenom?: boolean;
  },
): MetricResult {
  const refs = [numerator.amount?.line.snapshotKey, denominator.amount?.line.snapshotKey].filter(
    Boolean,
  ) as string[];
  if (numerator.incompatibleCurrency || denominator.incompatibleCurrency) {
    return fail(opts.code, opts.label, opts.dimension, opts.formulaId, "INCOMPATIBLE", refs, [
      "Currency incompatible",
    ]);
  }
  if (!numerator.amount || !denominator.amount) {
    return fail(opts.code, opts.label, opts.dimension, opts.formulaId, "INSUFFICIENT_INPUTS", refs);
  }
  const nCur = numerator.amount.line.currency;
  const dCur = denominator.amount.line.currency;
  if (nCur && dCur && nCur !== dCur) {
    return fail(opts.code, opts.label, opts.dimension, opts.formulaId, "INCOMPATIBLE", refs, [
      "Numerator and denominator currencies differ",
    ]);
  }
  if (isZero(denominator.amount.value) || (!opts.allowNegDenom && denominator.amount.value.lte(0))) {
    return fail(opts.code, opts.label, opts.dimension, opts.formulaId, "UNDEFINED", refs, [
      "Non-positive denominator",
    ]);
  }
  const warnings: string[] = [];
  if (numerator.conflict || denominator.conflict) warnings.push("Conflicting source figures resolved by review preference");
  return metric({
    code: opts.code,
    label: opts.label,
    dimension: opts.dimension,
    status: "COMPUTED",
    value: toPlain(numerator.amount.value.div(denominator.amount.value)),
    unit: opts.unit ?? "ratio",
    formulaId: opts.formulaId,
    periodStart: numerator.amount.line.periodStart,
    periodEnd: numerator.amount.line.periodEnd,
    periodLabel: numerator.amount.line.periodLabel,
    inputRefs: refs,
    warnings,
  });
}

export function computeMetrics(snapshot: DiagnosticSnapshot): MetricResult[] {
  const metrics: MetricResult[] = [];

  const revenue = resolveConcept(snapshot, "REVENUE");
  const cogs = resolveConcept(snapshot, "COST_OF_GOODS_SOLD");
  const gross = resolveConcept(snapshot, "GROSS_PROFIT");
  const opex = resolveConcept(snapshot, "OPERATING_EXPENSES");
  const opProfit = resolveConcept(snapshot, "OPERATING_PROFIT");
  const net = resolveConcept(snapshot, "NET_PROFIT");
  const cash = resolveConcept(snapshot, "CASH_AND_EQUIVALENTS");
  const ar = resolveConcept(snapshot, "ACCOUNTS_RECEIVABLE");
  const ap = resolveConcept(snapshot, "ACCOUNTS_PAYABLE");
  const inventory = resolveConcept(snapshot, "INVENTORY");
  const ca = resolveConcept(snapshot, "CURRENT_ASSETS");
  const cl = resolveConcept(snapshot, "CURRENT_LIABILITIES");
  const totalAssets = resolveConcept(snapshot, "TOTAL_ASSETS");
  const totalLiab = resolveConcept(snapshot, "TOTAL_LIABILITIES");
  const equity = resolveConcept(snapshot, "EQUITY");
  const debt = resolveConcept(snapshot, "INTEREST_BEARING_DEBT");
  const interest = resolveConcept(snapshot, "INTEREST_EXPENSE");
  const ocf = resolveConcept(snapshot, "OPERATING_CASH_FLOW");
  const capex = resolveConcept(snapshot, "CAPITAL_EXPENDITURE");

  // Revenue growth — comparable period length class required (annual↔annual, etc.)
  const revPeriods = amountsByPeriod(snapshot, "REVENUE");
  if (revPeriods.length >= 2) {
    const prev = revPeriods[revPeriods.length - 2]!;
    const curr = revPeriods[revPeriods.length - 1]!;
    const refs = [prev.amount.line.snapshotKey, curr.amount.line.snapshotKey];
    if (!periodsAreComparable(prev, curr)) {
      metrics.push(
        fail(
          "REVENUE_GROWTH",
          "Revenue growth",
          "profitability",
          "calc.v1.revenue_growth",
          "INCOMPATIBLE",
          refs,
          ["Period length classes are not comparable"],
        ),
      );
    } else if (isZero(prev.amount.value)) {
      metrics.push(
        fail("REVENUE_GROWTH", "Revenue growth", "profitability", "calc.v1.revenue_growth", "UNDEFINED", refs, [
          "Prior revenue is zero",
        ]),
      );
    } else {
      metrics.push(
        metric({
          code: "REVENUE_GROWTH",
          label: "Revenue growth",
          dimension: "profitability",
          status: "COMPUTED",
          value: toPlain(curr.amount.value.minus(prev.amount.value).div(prev.amount.value.abs())),
          unit: "ratio",
          formulaId: "calc.v1.revenue_growth",
          periodStart: curr.periodStart,
          periodEnd: curr.periodEnd,
          periodLabel: curr.periodLabel,
          inputRefs: refs,
        }),
      );
    }
  } else {
    metrics.push(
      fail("REVENUE_GROWTH", "Revenue growth", "profitability", "calc.v1.revenue_growth", "INSUFFICIENT_INPUTS", []),
    );
  }

  // Margins
  if (gross.amount && revenue.amount) {
    metrics.push(
      ratioOrUndefined(gross, revenue, {
        code: "GROSS_MARGIN",
        label: "Gross profit margin",
        dimension: "profitability",
        formulaId: "calc.v1.gross_margin",
      }),
    );
  } else if (revenue.amount && cogs.amount) {
    const gp = { amount: { value: revenue.amount.value.minus(cogs.amount.value), line: revenue.amount.line }, conflict: false, incompatibleCurrency: false };
    metrics.push(
      ratioOrUndefined(gp, revenue, {
        code: "GROSS_MARGIN",
        label: "Gross profit margin",
        dimension: "profitability",
        formulaId: "calc.v1.gross_margin_derived",
      }),
    );
  } else {
    metrics.push(
      fail("GROSS_MARGIN", "Gross profit margin", "profitability", "calc.v1.gross_margin", "INSUFFICIENT_INPUTS", []),
    );
  }

  metrics.push(
    ratioOrUndefined(opProfit, revenue, {
      code: "OPERATING_MARGIN",
      label: "Operating profit margin",
      dimension: "profitability",
      formulaId: "calc.v1.operating_margin",
    }),
  );
  metrics.push(
    ratioOrUndefined(net, revenue, {
      code: "NET_MARGIN",
      label: "Net profit margin",
      dimension: "profitability",
      formulaId: "calc.v1.net_margin",
    }),
  );
  metrics.push(
    ratioOrUndefined(opex, revenue, {
      code: "OPEX_RATIO",
      label: "Operating expense ratio",
      dimension: "profitability",
      formulaId: "calc.v1.opex_ratio",
    }),
  );
  metrics.push(
    ratioOrUndefined(cogs, revenue, {
      code: "COGS_RATIO",
      label: "Cost of goods sold ratio",
      dimension: "profitability",
      formulaId: "calc.v1.cogs_ratio",
    }),
  );

  // Liquidity
  metrics.push(
    ratioOrUndefined(ca, cl, {
      code: "CURRENT_RATIO",
      label: "Current ratio",
      dimension: "liquidity",
      formulaId: "calc.v1.current_ratio",
    }),
  );

  if (!inventory.amount) {
    metrics.push(
      fail("QUICK_RATIO", "Quick ratio", "liquidity", "calc.v1.quick_ratio", "INSUFFICIENT_INPUTS", [], [
        "Inventory required; not inferred as zero",
      ]),
    );
  } else if (!ca.amount || !cl.amount) {
    metrics.push(
      fail("QUICK_RATIO", "Quick ratio", "liquidity", "calc.v1.quick_ratio", "INSUFFICIENT_INPUTS", []),
    );
  } else if (
    inventory.incompatibleCurrency ||
    ca.incompatibleCurrency ||
    cl.incompatibleCurrency ||
    (ca.amount.line.currency &&
      inventory.amount.line.currency &&
      ca.amount.line.currency !== inventory.amount.line.currency) ||
    (ca.amount.line.currency &&
      cl.amount.line.currency &&
      ca.amount.line.currency !== cl.amount.line.currency)
  ) {
    metrics.push(fail("QUICK_RATIO", "Quick ratio", "liquidity", "calc.v1.quick_ratio", "INCOMPATIBLE", []));
  } else if (isZero(cl.amount.value) || cl.amount.value.lte(0)) {
    metrics.push(
      fail(
        "QUICK_RATIO",
        "Quick ratio",
        "liquidity",
        "calc.v1.quick_ratio",
        "UNDEFINED",
        [ca.amount.line.snapshotKey, inventory.amount.line.snapshotKey, cl.amount.line.snapshotKey],
      ),
    );
  } else {
    const quick = ca.amount.value.minus(inventory.amount.value);
    metrics.push(
      metric({
        code: "QUICK_RATIO",
        label: "Quick ratio",
        dimension: "liquidity",
        status: "COMPUTED",
        value: toPlain(quick.div(cl.amount.value)),
        unit: "ratio",
        formulaId: "calc.v1.quick_ratio",
        periodStart: ca.amount.line.periodStart,
        periodEnd: ca.amount.line.periodEnd,
        periodLabel: ca.amount.line.periodLabel,
        inputRefs: [
          ca.amount.line.snapshotKey,
          inventory.amount.line.snapshotKey,
          cl.amount.line.snapshotKey,
        ],
      }),
    );
  }

  metrics.push(
    ratioOrUndefined(cash, cl, {
      code: "CASH_RATIO",
      label: "Cash ratio",
      dimension: "liquidity",
      formulaId: "calc.v1.cash_ratio",
    }),
  );

  if (
    ca.amount &&
    cl.amount &&
    !ca.incompatibleCurrency &&
    !cl.incompatibleCurrency &&
    !(ca.amount.line.currency && cl.amount.line.currency && ca.amount.line.currency !== cl.amount.line.currency)
  ) {
    metrics.push(
      metric({
        code: "WORKING_CAPITAL",
        label: "Working capital",
        dimension: "liquidity",
        status: "COMPUTED",
        value: toPlain(ca.amount.value.minus(cl.amount.value)),
        unit: "currency",
        formulaId: "calc.v1.working_capital",
        periodStart: ca.amount.line.periodStart,
        periodEnd: ca.amount.line.periodEnd,
        periodLabel: ca.amount.line.periodLabel,
        inputRefs: [ca.amount.line.snapshotKey, cl.amount.line.snapshotKey],
      }),
    );
  } else {
    const currencyClash =
      ca.incompatibleCurrency ||
      cl.incompatibleCurrency ||
      Boolean(
        ca.amount?.line.currency &&
          cl.amount?.line.currency &&
          ca.amount.line.currency !== cl.amount.line.currency,
      );
    metrics.push(
      fail(
        "WORKING_CAPITAL",
        "Working capital",
        "liquidity",
        "calc.v1.working_capital",
        currencyClash ? "INCOMPATIBLE" : "INSUFFICIENT_INPUTS",
        [],
      ),
    );
  }

  // Leverage — debt-to-equity requires INTEREST_BEARING_DEBT only
  metrics.push(
    ratioOrUndefined(debt, equity, {
      code: "DEBT_TO_EQUITY",
      label: "Debt-to-equity ratio",
      dimension: "leverage",
      formulaId: "calc.v1.debt_to_equity",
    }),
  );
  metrics.push(
    ratioOrUndefined(totalLiab, totalAssets, {
      code: "LIABILITIES_TO_ASSETS",
      label: "Liabilities-to-assets ratio",
      dimension: "leverage",
      formulaId: "calc.v1.liabilities_to_assets",
    }),
  );
  metrics.push(
    ratioOrUndefined(opProfit, interest, {
      code: "INTEREST_COVERAGE",
      label: "Interest coverage ratio",
      dimension: "leverage",
      formulaId: "calc.v1.interest_coverage",
    }),
  );

  // Efficiency — require period days + balances (point-in-time flagged)
  const days =
    periodDays(snapshot.periodStart, snapshot.periodEnd) ??
    periodDays(revenue.amount?.line.periodStart ?? null, revenue.amount?.line.periodEnd ?? null);

  function turnover(
    code: string,
    label: string,
    flow: ReturnType<typeof resolveConcept>,
    balance: ReturnType<typeof resolveConcept>,
    formulaId: string,
  ): MetricResult {
    if (!flow.amount || !balance.amount) {
      return fail(code, label, "efficiency", formulaId, "INSUFFICIENT_INPUTS", []);
    }
    if (
      flow.incompatibleCurrency ||
      balance.incompatibleCurrency ||
      (flow.amount?.line.currency &&
        balance.amount?.line.currency &&
        flow.amount.line.currency !== balance.amount.line.currency)
    ) {
      return fail(code, label, "efficiency", formulaId, "INCOMPATIBLE", []);
    }
    if (!isPositive(balance.amount.value)) {
      return fail(code, label, "efficiency", formulaId, "UNDEFINED", [balance.amount.line.snapshotKey], [
        "Non-positive balance denominator",
      ]);
    }
    return metric({
      code,
      label,
      dimension: "efficiency",
      status: "COMPUTED",
      value: toPlain(flow.amount.value.div(balance.amount.value)),
      unit: "ratio",
      formulaId,
      periodStart: flow.amount.line.periodStart,
      periodEnd: flow.amount.line.periodEnd,
      periodLabel: flow.amount.line.periodLabel,
      inputRefs: [flow.amount.line.snapshotKey, balance.amount.line.snapshotKey],
      warnings: ["Average balance unavailable; used point-in-time balance"],
    });
  }

  const recvTurnover = turnover(
    "RECEIVABLES_TURNOVER",
    "Receivables turnover",
    revenue,
    ar,
    "calc.v1.receivables_turnover",
  );
  metrics.push(recvTurnover);

  if (recvTurnover.status === "COMPUTED" && days && recvTurnover.value) {
    const t = d(recvTurnover.value);
    if (isPositive(t)) {
      metrics.push(
        metric({
          code: "DSO",
          label: "Days sales outstanding",
          dimension: "efficiency",
          status: "COMPUTED",
          value: toPlain(d(days).div(t)),
          unit: "days",
          formulaId: "calc.v1.dso",
          periodStart: recvTurnover.periodStart,
          periodEnd: recvTurnover.periodEnd,
          periodLabel: recvTurnover.periodLabel,
          inputRefs: recvTurnover.inputRefs,
          warnings: recvTurnover.warnings,
        }),
      );
    } else {
      metrics.push(fail("DSO", "Days sales outstanding", "efficiency", "calc.v1.dso", "UNDEFINED", []));
    }
  } else {
    metrics.push(
      fail(
        "DSO",
        "Days sales outstanding",
        "efficiency",
        "calc.v1.dso",
        days == null ? "INSUFFICIENT_INPUTS" : recvTurnover.status,
        [],
        days == null ? ["Period length required"] : [],
      ),
    );
  }

  const invTurnover = turnover(
    "INVENTORY_TURNOVER",
    "Inventory turnover",
    cogs,
    inventory,
    "calc.v1.inventory_turnover",
  );
  metrics.push(invTurnover);

  let inventoryDays: MetricResult | null = null;
  if (invTurnover.status === "COMPUTED" && days && invTurnover.value && isPositive(d(invTurnover.value))) {
    inventoryDays = metric({
      code: "INVENTORY_DAYS",
      label: "Inventory days",
      dimension: "efficiency",
      status: "COMPUTED",
      value: toPlain(d(days).div(d(invTurnover.value))),
      unit: "days",
      formulaId: "calc.v1.inventory_days",
      periodStart: invTurnover.periodStart,
      periodEnd: invTurnover.periodEnd,
      periodLabel: invTurnover.periodLabel,
      inputRefs: invTurnover.inputRefs,
      warnings: invTurnover.warnings,
    });
    metrics.push(inventoryDays);
  } else {
    metrics.push(
      fail("INVENTORY_DAYS", "Inventory days", "efficiency", "calc.v1.inventory_days", "INSUFFICIENT_INPUTS", []),
    );
  }

  const payTurnover = turnover(
    "PAYABLES_TURNOVER",
    "Payables turnover",
    cogs,
    ap,
    "calc.v1.payables_turnover",
  );
  metrics.push(payTurnover);

  let payablesDays: MetricResult | null = null;
  if (payTurnover.status === "COMPUTED" && days && payTurnover.value && isPositive(d(payTurnover.value))) {
    payablesDays = metric({
      code: "PAYABLES_DAYS",
      label: "Payables days",
      dimension: "efficiency",
      status: "COMPUTED",
      value: toPlain(d(days).div(d(payTurnover.value))),
      unit: "days",
      formulaId: "calc.v1.payables_days",
      periodStart: payTurnover.periodStart,
      periodEnd: payTurnover.periodEnd,
      periodLabel: payTurnover.periodLabel,
      inputRefs: payTurnover.inputRefs,
      warnings: payTurnover.warnings,
    });
    metrics.push(payablesDays);
  } else {
    metrics.push(
      fail("PAYABLES_DAYS", "Payables days", "efficiency", "calc.v1.payables_days", "INSUFFICIENT_INPUTS", []),
    );
  }

  const dso = metrics.find((m) => m.code === "DSO");
  if (
    dso?.status === "COMPUTED" &&
    inventoryDays?.status === "COMPUTED" &&
    payablesDays?.status === "COMPUTED" &&
    dso.value &&
    inventoryDays.value &&
    payablesDays.value
  ) {
    metrics.push(
      metric({
        code: "CASH_CONVERSION_CYCLE",
        label: "Cash conversion cycle",
        dimension: "efficiency",
        status: "COMPUTED",
        value: toPlain(d(dso.value).plus(inventoryDays.value).minus(payablesDays.value)),
        unit: "days",
        formulaId: "calc.v1.ccc",
        periodStart: dso.periodStart,
        periodEnd: dso.periodEnd,
        periodLabel: dso.periodLabel,
        inputRefs: [...dso.inputRefs, ...inventoryDays.inputRefs, ...payablesDays.inputRefs],
      }),
    );
  } else {
    metrics.push(
      fail(
        "CASH_CONVERSION_CYCLE",
        "Cash conversion cycle",
        "efficiency",
        "calc.v1.ccc",
        "INSUFFICIENT_INPUTS",
        [],
      ),
    );
  }

  // Cash flow
  metrics.push(
    ratioOrUndefined(ocf, revenue, {
      code: "OCF_MARGIN",
      label: "Operating cash-flow margin",
      dimension: "cash_flow",
      formulaId: "calc.v1.ocf_margin",
      allowNegDenom: false,
    }),
  );
  metrics.push(
    ratioOrUndefined(ocf, cl, {
      code: "OCF_TO_CURRENT_LIABILITIES",
      label: "Operating cash flow to current liabilities",
      dimension: "cash_flow",
      formulaId: "calc.v1.ocf_to_cl",
    }),
  );

  if (
    ocf.amount &&
    capex.amount &&
    !ocf.incompatibleCurrency &&
    !capex.incompatibleCurrency &&
    !(
      ocf.amount.line.currency &&
      capex.amount.line.currency &&
      ocf.amount.line.currency !== capex.amount.line.currency
    )
  ) {
    metrics.push(
      metric({
        code: "FREE_CASH_FLOW",
        label: "Free cash flow",
        dimension: "cash_flow",
        status: "COMPUTED",
        value: toPlain(ocf.amount.value.minus(capex.amount.value)),
        unit: "currency",
        formulaId: "calc.v1.fcf",
        periodStart: ocf.amount.line.periodStart,
        periodEnd: ocf.amount.line.periodEnd,
        periodLabel: ocf.amount.line.periodLabel,
        inputRefs: [ocf.amount.line.snapshotKey, capex.amount.line.snapshotKey],
      }),
    );
  } else {
    const currencyClash =
      ocf.incompatibleCurrency ||
      capex.incompatibleCurrency ||
      Boolean(
        ocf.amount?.line.currency &&
          capex.amount?.line.currency &&
          ocf.amount.line.currency !== capex.amount.line.currency,
      );
    metrics.push(
      fail(
        "FREE_CASH_FLOW",
        "Free cash flow",
        "cash_flow",
        "calc.v1.fcf",
        currencyClash ? "INCOMPATIBLE" : "INSUFFICIENT_INPUTS",
        [],
        !capex.amount ? ["Capital expenditure required; not inferred"] : [],
      ),
    );
  }

  return metrics;
}
