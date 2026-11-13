import { d, type Decimal } from "./decimal.js";
import type { DiagnosticSnapshot, SnapshotLineItem } from "./types.js";

export type ConceptAmount = {
  value: Decimal;
  line: SnapshotLineItem;
};

export function periodDays(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

export function selectConceptLines(
  snapshot: DiagnosticSnapshot,
  concept: string,
): SnapshotLineItem[] {
  return snapshot.lines.filter((l) => l.concept === concept && l.actualValue != null);
}

function periodSortKey(line: SnapshotLineItem): string {
  return `${line.periodEnd ?? ""}|${line.periodStart ?? ""}|${line.periodLabel ?? ""}`;
}

/**
 * Picks a single amount for a concept within the run currency.
 * When multiple periods exist, uses the latest period.
 * Contradictory values within the same period → conflict.
 */
export function resolveConcept(
  snapshot: DiagnosticSnapshot,
  concept: string,
): { amount: ConceptAmount | null; conflict: boolean; incompatibleCurrency: boolean } {
  const lines = selectConceptLines(snapshot, concept);
  if (!lines.length) {
    return { amount: null, conflict: false, incompatibleCurrency: false };
  }

  const explicitCurrencies = new Set(
    lines.map((l) => l.currency).filter((c): c is string => Boolean(c)),
  );
  // Never silently mix currencies when the run has no single currency.
  if (!snapshot.currency && explicitCurrencies.size > 1) {
    return { amount: null, conflict: false, incompatibleCurrency: true };
  }

  const currencyFiltered = snapshot.currency
    ? lines.filter((l) => !l.currency || l.currency === snapshot.currency)
    : lines;
  if (!currencyFiltered.length) {
    return { amount: null, conflict: false, incompatibleCurrency: true };
  }

  const byPeriod = new Map<string, SnapshotLineItem[]>();
  for (const line of currencyFiltered) {
    const key = periodSortKey(line);
    const list = byPeriod.get(key) ?? [];
    list.push(line);
    byPeriod.set(key, list);
  }
  const latestKey = [...byPeriod.keys()].sort().at(-1)!;
  const periodLines = byPeriod.get(latestKey)!;

  const preferred = periodLines.filter(
    (l) => l.reviewStatus === "CONFIRMED" || l.reviewStatus === "CORRECTED",
  );
  const pool = preferred.length ? preferred : periodLines;
  const values = new Set(pool.map((p) => p.actualValue));
  if (values.size > 1) {
    return { amount: null, conflict: true, incompatibleCurrency: false };
  }
  const line = pool[0]!;
  return {
    amount: { value: d(line.actualValue!), line },
    conflict: periodLines.length > pool.length && new Set(periodLines.map((p) => p.actualValue)).size > 1,
    incompatibleCurrency: false,
  };
}

/** Classify reporting period length for comparable period-over-period KPIs. */
export function periodLengthClass(start: string | null, end: string | null): "annual" | "quarterly" | "monthly" | "unknown" {
  const days = periodDays(start, end);
  if (days == null) return "unknown";
  if (days >= 300) return "annual";
  if (days >= 80 && days <= 100) return "quarterly";
  if (days >= 25 && days <= 35) return "monthly";
  return "unknown";
}

export function periodsAreComparable(
  a: { periodStart: string | null; periodEnd: string | null },
  b: { periodStart: string | null; periodEnd: string | null },
): boolean {
  const ca = periodLengthClass(a.periodStart, a.periodEnd);
  const cb = periodLengthClass(b.periodStart, b.periodEnd);
  if (ca === "unknown" || cb === "unknown") return false;
  return ca === cb;
}

export function amountsByPeriod(
  snapshot: DiagnosticSnapshot,
  concept: string,
): Array<{ periodKey: string; periodStart: string | null; periodEnd: string | null; periodLabel: string | null; amount: ConceptAmount }> {
  const currencies = new Set(
    selectConceptLines(snapshot, concept)
      .map((l) => l.currency)
      .filter((c): c is string => Boolean(c)),
  );
  if (!snapshot.currency && currencies.size > 1) {
    return [];
  }
  const lines = selectConceptLines(snapshot, concept).filter((l) => {
    if (!snapshot.currency) return true;
    return !l.currency || l.currency === snapshot.currency;
  });
  const groups = new Map<string, SnapshotLineItem[]>();
  for (const line of lines) {
    const key = `${line.periodStart ?? ""}|${line.periodEnd ?? ""}|${line.periodLabel ?? ""}`;
    const list = groups.get(key) ?? [];
    list.push(line);
    groups.set(key, list);
  }
  const out: Array<{
    periodKey: string;
    periodStart: string | null;
    periodEnd: string | null;
    periodLabel: string | null;
    amount: ConceptAmount;
  }> = [];
  for (const [periodKey, group] of groups) {
    const values = new Set(group.map((g) => g.actualValue));
    if (values.size !== 1) continue;
    const line = group.find((g) => g.reviewStatus === "CONFIRMED" || g.reviewStatus === "CORRECTED") ?? group[0]!;
    out.push({
      periodKey,
      periodStart: line.periodStart,
      periodEnd: line.periodEnd,
      periodLabel: line.periodLabel,
      amount: { value: d(line.actualValue!), line },
    });
  }
  return out.sort((a, b) => {
    const ae = a.periodEnd ?? a.periodLabel ?? "";
    const be = b.periodEnd ?? b.periodLabel ?? "";
    return ae < be ? -1 : ae > be ? 1 : 0;
  });
}

export function averageOf(values: Decimal[]): Decimal | null {
  if (!values.length) return null;
  return values.reduce((acc, v) => acc.plus(v), d(0)).div(values.length);
}
