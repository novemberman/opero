import type { DiagnosticSnapshot, SnapshotLineItem } from "../types.js";
import type { ConflictCandidate, EvidenceConflict, ReconciliationSeverity } from "./types.js";

const MATERIAL_CONCEPTS = new Set([
  "REVENUE",
  "NET_PROFIT",
  "GROSS_PROFIT",
  "CURRENT_ASSETS",
  "CURRENT_LIABILITIES",
  "TOTAL_ASSETS",
  "TOTAL_LIABILITIES",
  "EQUITY",
  "OPERATING_CASH_FLOW",
  "CASH_AND_EQUIVALENTS",
]);

function periodKey(line: SnapshotLineItem): string {
  return `${line.periodEnd ?? ""}|${line.periodStart ?? ""}|${line.periodLabel ?? ""}`;
}

function severityForConcept(concept: string, valueSpread: number): ReconciliationSeverity {
  if (MATERIAL_CONCEPTS.has(concept)) {
    return valueSpread > 0.05 ? "CRITICAL" : "HIGH";
  }
  return valueSpread > 0.1 ? "HIGH" : "MEDIUM";
}

function toCandidate(line: SnapshotLineItem): ConflictCandidate {
  return {
    documentId: line.documentId,
    lineItemId: line.lineItemId,
    snapshotKey: line.snapshotKey,
    label: line.labelRaw,
    value: line.actualValue,
    currency: line.currency,
    periodLabel: line.periodLabel,
    reviewStatus: line.reviewStatus,
  };
}

/**
 * Detects same-period value conflicts and multi-currency clashes from a diagnostic snapshot.
 * Pure / deterministic — does not write to the database.
 */
export function detectEvidenceConflicts(snapshot: DiagnosticSnapshot): EvidenceConflict[] {
  const conflicts: EvidenceConflict[] = [];
  const byConcept = new Map<string, SnapshotLineItem[]>();

  for (const line of snapshot.lines) {
    if (line.actualValue == null) continue;
    const list = byConcept.get(line.concept) ?? [];
    list.push(line);
    byConcept.set(line.concept, list);
  }

  for (const [concept, lines] of byConcept) {
    const byPeriod = new Map<string, SnapshotLineItem[]>();
    for (const line of lines) {
      const key = periodKey(line);
      const list = byPeriod.get(key) ?? [];
      list.push(line);
      byPeriod.set(key, list);
    }

    for (const [pKey, periodLines] of byPeriod) {
      const currencies = new Set(
        periodLines.map((l) => l.currency).filter((c): c is string => Boolean(c)),
      );
      if (currencies.size > 1) {
        conflicts.push({
          conflictKey: `currency:${concept}:${pKey}`,
          concept,
          severity: "CRITICAL",
          title: `Multi-currency values for ${concept}`,
          explanation: `Found currencies ${[...currencies].join(", ")} for the same concept and period`,
          candidates: periodLines.map(toCandidate),
        });
        continue;
      }

      const values = [...new Set(periodLines.map((l) => l.actualValue).filter(Boolean))];
      if (values.length <= 1) continue;

      const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n));
      const max = Math.max(...nums.map(Math.abs), 1);
      const spread =
        nums.length >= 2
          ? (Math.max(...nums) - Math.min(...nums)) / max
          : 1;

      // Prefer confirmed/corrected — only flag when unresolved (no single preferred value).
      const preferred = periodLines.filter(
        (l) => l.reviewStatus === "CONFIRMED" || l.reviewStatus === "CORRECTED",
      );
      const preferredValues = new Set(preferred.map((p) => p.actualValue));
      if (preferred.length > 0 && preferredValues.size === 1) {
        continue;
      }

      conflicts.push({
        conflictKey: `value:${concept}:${pKey}`,
        concept,
        severity: severityForConcept(concept, spread),
        title: `Conflicting values for ${concept}`,
        explanation: `Multiple values (${values.join(", ")}) for the same concept and period require reconciliation`,
        candidates: periodLines.map(toCandidate),
      });
    }
  }

  return conflicts.sort((a, b) => a.conflictKey.localeCompare(b.conflictKey));
}

export function hasUnresolvedCriticalConflicts(
  conflicts: EvidenceConflict[],
  resolvedKeys: ReadonlySet<string>,
): boolean {
  return conflicts.some(
    (c) => c.severity === "CRITICAL" && !resolvedKeys.has(c.conflictKey),
  );
}
