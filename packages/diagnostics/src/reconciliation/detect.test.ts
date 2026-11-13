import { describe, expect, it } from "vitest";
import type { DiagnosticSnapshot, SnapshotLineItem } from "../types.js";
import { detectEvidenceConflicts, hasUnresolvedCriticalConflicts } from "./detect.js";

function line(overrides: Partial<SnapshotLineItem>): SnapshotLineItem {
  return {
    snapshotKey: "k1",
    lineItemId: "l1",
    documentId: "d1",
    extractionId: "e1",
    statementId: "s1",
    concept: "REVENUE",
    labelRaw: "Revenue",
    rawValue: "100",
    normalizedValue: "100",
    actualValue: "100",
    currency: "USD",
    unitScale: "ACTUAL",
    quality: "HIGH",
    reviewStatus: "PENDING",
    statementType: "INCOME_STATEMENT",
    periodStart: "2024-01-01",
    periodEnd: "2024-12-31",
    periodLabel: "FY2024",
    evidenceReferenceId: null,
    evidenceKey: null,
    ...overrides,
  };
}

function snap(lines: SnapshotLineItem[]): DiagnosticSnapshot {
  return {
    contentHash: "h",
    currency: "USD",
    periodStart: "2024-01-01",
    periodEnd: "2024-12-31",
    periodLabel: "FY2024",
    documentIds: ["d1", "d2"],
    extractionIds: ["e1"],
    lines,
    warnings: [],
  };
}

describe("detectEvidenceConflicts", () => {
  it("detects conflicting revenue values in the same period", () => {
    const conflicts = detectEvidenceConflicts(
      snap([
        line({ snapshotKey: "a", lineItemId: "l1", actualValue: "100", documentId: "d1" }),
        line({ snapshotKey: "b", lineItemId: "l2", actualValue: "150", documentId: "d2" }),
      ]),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.severity).toBe("CRITICAL");
    expect(conflicts[0]!.concept).toBe("REVENUE");
  });

  it("skips conflicts when a single confirmed value is preferred", () => {
    const conflicts = detectEvidenceConflicts(
      snap([
        line({
          snapshotKey: "a",
          lineItemId: "l1",
          actualValue: "100",
          reviewStatus: "CONFIRMED",
        }),
        line({
          snapshotKey: "b",
          lineItemId: "l2",
          actualValue: "150",
          reviewStatus: "PENDING",
        }),
      ]),
    );
    expect(conflicts).toHaveLength(0);
  });

  it("flags multi-currency clashes as critical", () => {
    const conflicts = detectEvidenceConflicts(
      snap([
        line({ snapshotKey: "a", actualValue: "100", currency: "USD" }),
        line({ snapshotKey: "b", actualValue: "100", currency: "EUR", lineItemId: "l2" }),
      ]),
    );
    expect(conflicts.some((c) => c.conflictKey.startsWith("currency:"))).toBe(true);
  });

  it("tracks unresolved critical conflicts", () => {
    const conflicts = detectEvidenceConflicts(
      snap([
        line({ snapshotKey: "a", actualValue: "100" }),
        line({ snapshotKey: "b", actualValue: "200", lineItemId: "l2" }),
      ]),
    );
    expect(hasUnresolvedCriticalConflicts(conflicts, new Set())).toBe(true);
    expect(hasUnresolvedCriticalConflicts(conflicts, new Set([conflicts[0]!.conflictKey]))).toBe(
      false,
    );
  });
});
