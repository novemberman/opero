import { resolveConcept } from "./concepts.js";
import { d, toPlain } from "./decimal.js";
import type { DiagnosticSnapshot, MetricResult, QualityAssessment, ScoreDimension } from "./types.js";

const CORE_CONCEPTS = [
  "REVENUE",
  "NET_PROFIT",
  "CURRENT_ASSETS",
  "CURRENT_LIABILITIES",
  "TOTAL_ASSETS",
  "TOTAL_LIABILITIES",
  "EQUITY",
  "OPERATING_CASH_FLOW",
] as const;

const DIMENSIONS: ScoreDimension[] = [
  "profitability",
  "liquidity",
  "leverage",
  "efficiency",
  "cash_flow",
];

function reviewWeight(status: string): number {
  // Only human-CONFIRMED evidence is authoritative; CORRECTED alone is not approval.
  switch (status) {
    case "CONFIRMED":
      return 1;
    case "CORRECTED":
    case "PENDING":
      return 0;
    default:
      return 0;
  }
}

function qualityWeight(q: string): number {
  switch (q) {
    case "HIGH":
      return 1;
    case "MEDIUM":
      return 0.75;
    case "LOW":
      return 0.4;
    case "MANUAL":
      return 0.35;
    default:
      return 0.5;
  }
}

export function assessQuality(
  snapshot: DiagnosticSnapshot,
  metrics: MetricResult[],
): QualityAssessment {
  const present = CORE_CONCEPTS.filter((c) => resolveConcept(snapshot, c).amount).length;
  const completeness = toPlain(d(present).div(CORE_CONCEPTS.length));

  let consistencyFlags = 0;
  let consistencyChecks = 0;

  const currencies = new Set(
    snapshot.lines.map((l) => l.currency).filter((c): c is string => Boolean(c)),
  );
  consistencyChecks += 1;
  if (currencies.size > 1) consistencyFlags += 1;

  const scales = new Set(snapshot.lines.map((l) => l.unitScale));
  consistencyChecks += 1;
  if (scales.size > 1) consistencyFlags += 1;

  const revenue = resolveConcept(snapshot, "REVENUE");
  const cogs = resolveConcept(snapshot, "COST_OF_GOODS_SOLD");
  const gross = resolveConcept(snapshot, "GROSS_PROFIT");
  const opex = resolveConcept(snapshot, "OPERATING_EXPENSES");
  const opProfit = resolveConcept(snapshot, "OPERATING_PROFIT");
  const interest = resolveConcept(snapshot, "INTEREST_EXPENSE");
  const pbt = resolveConcept(snapshot, "PROFIT_BEFORE_TAX");
  const tax = resolveConcept(snapshot, "INCOME_TAX_EXPENSE");
  const net = resolveConcept(snapshot, "NET_PROFIT");
  const totalAssets = resolveConcept(snapshot, "TOTAL_ASSETS");
  const totalLiab = resolveConcept(snapshot, "TOTAL_LIABILITIES");
  const equity = resolveConcept(snapshot, "EQUITY");
  const totalLE = resolveConcept(snapshot, "TOTAL_LIABILITIES_AND_EQUITY");

  function identityOk(
    left: ReturnType<typeof d>,
    right: ReturnType<typeof d>,
    basis: ReturnType<typeof d>,
  ): boolean {
    return left.minus(right).abs().lte(basis.abs().mul("0.02").plus(1));
  }

  if (revenue.amount && cogs.amount && gross.amount) {
    consistencyChecks += 1;
    const derived = revenue.amount.value.minus(cogs.amount.value);
    if (!identityOk(derived, gross.amount.value, gross.amount.value)) {
      consistencyFlags += 1;
    }
  }
  if (gross.amount && opex.amount && opProfit.amount) {
    consistencyChecks += 1;
    const derived = gross.amount.value.minus(opex.amount.value);
    if (!identityOk(derived, opProfit.amount.value, opProfit.amount.value)) {
      consistencyFlags += 1;
    }
  }
  if (opProfit.amount && interest.amount && pbt.amount) {
    consistencyChecks += 1;
    const derived = opProfit.amount.value.minus(interest.amount.value);
    if (!identityOk(derived, pbt.amount.value, pbt.amount.value)) {
      consistencyFlags += 1;
    }
  }
  if (pbt.amount && tax.amount && net.amount) {
    consistencyChecks += 1;
    const derived = pbt.amount.value.minus(tax.amount.value);
    if (!identityOk(derived, net.amount.value, net.amount.value)) {
      consistencyFlags += 1;
    }
  }
  if (totalAssets.amount && totalLiab.amount && equity.amount) {
    consistencyChecks += 1;
    const derived = totalLiab.amount.value.plus(equity.amount.value);
    if (!identityOk(derived, totalAssets.amount.value, totalAssets.amount.value)) {
      consistencyFlags += 1;
    }
  }
  if (totalAssets.amount && totalLE.amount) {
    consistencyChecks += 1;
    if (!identityOk(totalLE.amount.value, totalAssets.amount.value, totalAssets.amount.value)) {
      consistencyFlags += 1;
    }
  }
  const conflictedCore = CORE_CONCEPTS.filter((c) => resolveConcept(snapshot, c).conflict);
  if (conflictedCore.length || revenue.conflict || cogs.conflict || gross.conflict) {
    consistencyChecks += 1;
    consistencyFlags += 1;
  }
  // Unresolved same-period duplicates (no preferred single value) heavily penalize consistency.
  const unresolved = ["REVENUE", "NET_PROFIT", "CURRENT_ASSETS", "CURRENT_LIABILITIES"].filter((c) => {
    const r = resolveConcept(snapshot, c);
    return r.conflict && !r.amount;
  });
  if (unresolved.length) {
    consistencyChecks += 1;
    consistencyFlags += 1;
  }

  const consistency =
    consistencyChecks === 0
      ? "1"
      : toPlain(d(1).minus(d(consistencyFlags).div(consistencyChecks)));

  const usable = snapshot.lines.filter((l) => l.actualValue != null);
  let reliability = d(0);
  if (usable.length) {
    const sum = usable.reduce(
      (acc, line) => acc.plus(d(reviewWeight(line.reviewStatus)).mul(qualityWeight(line.quality))),
      d(0),
    );
    reliability = sum.div(usable.length);
  }
  const evidenceReliability = toPlain(reliability);

  const coveredDims = DIMENSIONS.filter((dim) =>
    metrics.some((m) => m.dimension === dim && m.status === "COMPUTED"),
  );
  const diagnosticCoverage = toPlain(d(coveredDims.length).div(DIMENSIONS.length));

  return {
    completeness,
    consistency,
    evidenceReliability,
    diagnosticCoverage,
    details: {
      coreConceptsPresent: present,
      coreConceptsTotal: CORE_CONCEPTS.length,
      coveredDimensions: coveredDims,
      missingDimensions: DIMENSIONS.filter((d0) => !coveredDims.includes(d0)),
      currencyCount: currencies.size,
      scaleCount: scales.size,
      snapshotWarnings: snapshot.warnings,
      lineCount: snapshot.lines.length,
    },
  };
}
