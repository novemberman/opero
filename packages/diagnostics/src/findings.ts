import { amountsByPeriod, periodsAreComparable, resolveConcept } from "./concepts.js";
import { d } from "./decimal.js";
import type { DiagnosticSnapshot, FindingDraft, MetricResult, QualityAssessment } from "./types.js";
import { RULE_SET_VERSION, SCORE_MIN_COVERAGE } from "./versions.js";

function metric(metrics: MetricResult[], code: string): MetricResult | undefined {
  return metrics.find((m) => m.code === code);
}

function evidenceFromRefs(snapshot: DiagnosticSnapshot, refs: string[]) {
  return refs.map((snapshotKey) => {
    const line = snapshot.lines.find((l) => l.snapshotKey === snapshotKey);
    return {
      snapshotKey,
      documentId: line?.documentId ?? null,
      lineItemId: line?.lineItemId ?? null,
      evidenceReferenceId: line?.evidenceReferenceId ?? null,
      label: line ? `${line.concept} ${line.labelRaw}` : null,
    };
  });
}

export function evaluateFindings(
  snapshot: DiagnosticSnapshot,
  metrics: MetricResult[],
  quality: QualityAssessment,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const reliability = quality.evidenceReliability;

  // Revenue up, margin down
  const revGrowth = metric(metrics, "REVENUE_GROWTH");
  const netMargins = amountsByPeriod(snapshot, "NET_PROFIT");
  const revenues = amountsByPeriod(snapshot, "REVENUE");
  if (
    revGrowth?.status === "COMPUTED" &&
    revGrowth.value &&
    d(revGrowth.value).gt(0) &&
    netMargins.length >= 2 &&
    revenues.length >= 2
  ) {
    const prevNet = netMargins[netMargins.length - 2]!;
    const currNet = netMargins[netMargins.length - 1]!;
    const prevRev = revenues[revenues.length - 2]!;
    const currRev = revenues[revenues.length - 1]!;
    if (
      periodsAreComparable(prevRev, currRev) &&
      periodsAreComparable(prevNet, currNet) &&
      !prevRev.amount.value.isZero() &&
      !currRev.amount.value.isZero()
    ) {
      const prevMargin = prevNet.amount.value.div(prevRev.amount.value);
      const currMargin = currNet.amount.value.div(currRev.amount.value);
      if (currMargin.lt(prevMargin)) {
        const refs = [
          prevNet.amount.line.snapshotKey,
          currNet.amount.line.snapshotKey,
          ...revGrowth.inputRefs,
        ];
        findings.push({
          ruleId: "REV_UP_MARGIN_DOWN",
          category: "RISK",
          severity: "MEDIUM",
          title: "Revenue rising while net margin deteriorates",
          explanation:
            "Comparable-period revenue increased, but net profit margin declined versus the prior period.",
          implication:
            "Growth may be less profitable; cost structure or pricing may be under pressure.",
          suggestedAction:
            "Investigate COGS, operating expenses, and one-off items behind the margin change.",
          confidence: reliability,
          supportingMetrics: ["REVENUE_GROWTH", "NET_MARGIN"],
          evidence: evidenceFromRefs(snapshot, refs),
        });
      }
    }
  }

  // OCF negative, NI positive
  const ocf = resolveConcept(snapshot, "OPERATING_CASH_FLOW");
  const ni = resolveConcept(snapshot, "NET_PROFIT");
  if (ocf.amount && ni.amount && ocf.amount.value.lt(0) && ni.amount.value.gt(0)) {
    const refs = [ocf.amount.line.snapshotKey, ni.amount.line.snapshotKey];
    findings.push({
      ruleId: "OCF_NEG_NI_POS",
      category: "RISK",
      severity: "HIGH",
      title: "Negative operating cash flow despite positive net income",
      explanation:
        "Net income is positive while operating cash flow is negative for the selected inputs.",
      implication:
        "Earnings quality may be weak; working-capital or non-cash items may explain the gap.",
      suggestedAction:
        "Reconcile net income to operating cash flow and review receivables, inventory, and payables.",
      confidence: reliability,
      supportingMetrics: ["OCF_MARGIN", "NET_MARGIN"],
      evidence: evidenceFromRefs(snapshot, refs),
    });
  }

  // CA < CL
  const ca = resolveConcept(snapshot, "CURRENT_ASSETS");
  const cl = resolveConcept(snapshot, "CURRENT_LIABILITIES");
  if (ca.amount && cl.amount && ca.amount.value.lt(cl.amount.value)) {
    findings.push({
      ruleId: "CA_LT_CL",
      category: "RISK",
      severity: "HIGH",
      title: "Current liabilities exceed current assets",
      explanation: "Working capital is negative based on reported current assets and liabilities.",
      implication: "Near-term liquidity pressure may exist; this does not by itself prove insolvency.",
      suggestedAction: "Review cash runway, undrawn facilities, and near-term payment obligations.",
      confidence: reliability,
      supportingMetrics: ["WORKING_CAPITAL", "CURRENT_RATIO"],
      evidence: evidenceFromRefs(snapshot, [ca.amount.line.snapshotKey, cl.amount.line.snapshotKey]),
    });
  }

  // AR growth > sales growth
  const arPeriods = amountsByPeriod(snapshot, "ACCOUNTS_RECEIVABLE");
  if (arPeriods.length >= 2 && revenues.length >= 2) {
    const prevAr = arPeriods[arPeriods.length - 2]!;
    const currAr = arPeriods[arPeriods.length - 1]!;
    const prevRev = revenues[revenues.length - 2]!;
    const currRev = revenues[revenues.length - 1]!;
    if (
      periodsAreComparable(prevAr, currAr) &&
      periodsAreComparable(prevRev, currRev) &&
      !prevAr.amount.value.isZero() &&
      !prevRev.amount.value.isZero()
    ) {
      const arGrowth = currAr.amount.value.minus(prevAr.amount.value).div(prevAr.amount.value.abs());
      const salesGrowth = currRev.amount.value.minus(prevRev.amount.value).div(prevRev.amount.value.abs());
      if (arGrowth.gt(salesGrowth)) {
        findings.push({
          ruleId: "AR_GROWTH_GT_SALES",
          category: "OBSERVATION",
          severity: "MEDIUM",
          title: "Receivables growing faster than sales",
          explanation: "Accounts receivable increased at a faster rate than revenue across comparable periods.",
          implication: "Collections or revenue recognition timing may warrant attention.",
          suggestedAction: "Review aging, credit terms, and whether revenue growth is cash-converting.",
          confidence: reliability,
          supportingMetrics: ["RECEIVABLES_TURNOVER", "DSO", "REVENUE_GROWTH"],
          evidence: evidenceFromRefs(snapshot, [
            prevAr.amount.line.snapshotKey,
            currAr.amount.line.snapshotKey,
            prevRev.amount.line.snapshotKey,
            currRev.amount.line.snapshotKey,
          ]),
        });
      }
    }
  }

  // Opex growth > revenue growth
  const opexPeriods = amountsByPeriod(snapshot, "OPERATING_EXPENSES");
  if (opexPeriods.length >= 2 && revenues.length >= 2) {
    const prevOx = opexPeriods[opexPeriods.length - 2]!;
    const currOx = opexPeriods[opexPeriods.length - 1]!;
    const prevRev = revenues[revenues.length - 2]!;
    const currRev = revenues[revenues.length - 1]!;
    if (
      periodsAreComparable(prevOx, currOx) &&
      periodsAreComparable(prevRev, currRev) &&
      !prevOx.amount.value.isZero() &&
      !prevRev.amount.value.isZero()
    ) {
      const oxGrowth = currOx.amount.value.minus(prevOx.amount.value).div(prevOx.amount.value.abs());
      const salesGrowth = currRev.amount.value.minus(prevRev.amount.value).div(prevRev.amount.value.abs());
      if (oxGrowth.gt(salesGrowth)) {
        findings.push({
          ruleId: "OPEX_GROWTH_GT_REV",
          category: "RISK",
          severity: "MEDIUM",
          title: "Operating expenses growing faster than revenue",
          explanation: "Operating expenses rose faster than revenue across comparable periods.",
          implication: "Operating leverage may be deteriorating.",
          suggestedAction: "Identify expense categories driving growth relative to sales.",
          confidence: reliability,
          supportingMetrics: ["OPEX_RATIO", "REVENUE_GROWTH"],
          evidence: evidenceFromRefs(snapshot, [
            prevOx.amount.line.snapshotKey,
            currOx.amount.line.snapshotKey,
            prevRev.amount.line.snapshotKey,
            currRev.amount.line.snapshotKey,
          ]),
        });
      }
    }
  }

  // Persistent losses
  if (netMargins.length >= 2) {
    const lastTwo = netMargins.slice(-2);
    if (
      periodsAreComparable(lastTwo[0]!, lastTwo[1]!) &&
      lastTwo.every((p) => p.amount.value.lt(0))
    ) {
      findings.push({
        ruleId: "PERSISTENT_LOSSES",
        category: "RISK",
        severity: "HIGH",
        title: "Persistent losses across comparable periods",
        explanation: "Net profit is negative in at least two comparable periods in the snapshot.",
        implication: "Sustained losses may pressure equity and liquidity over time.",
        suggestedAction: "Review path to profitability and cash runway with management.",
        confidence: reliability,
        supportingMetrics: ["NET_MARGIN"],
        evidence: evidenceFromRefs(
          snapshot,
          lastTwo.map((p) => p.amount.line.snapshotKey),
        ),
      });
    }
  }

  // Weak coverage
  if (d(quality.diagnosticCoverage).lt(SCORE_MIN_COVERAGE)) {
    findings.push({
      ruleId: "WEAK_COVERAGE",
      category: "DATA_QUALITY",
      severity: "INFO",
      title: "Weak evidence coverage preventing reliable assessment",
      explanation: `Diagnostic coverage is ${quality.diagnosticCoverage}, below the ${SCORE_MIN_COVERAGE} threshold for publishing an overall score.`,
      implication: "An overall Business Health Score is withheld or limited until more inputs are available.",
      suggestedAction:
        "Upload or confirm missing statements (balance sheet, cash flow, inventory, debt, capex) and review key line items.",
      confidence: reliability,
      supportingMetrics: [],
      evidence: [],
    });
  }

  void RULE_SET_VERSION;
  return findings;
}
