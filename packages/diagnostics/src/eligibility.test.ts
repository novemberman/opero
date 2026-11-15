import { describe, expect, it } from "vitest";
import {
  evaluateMonetaryEligibility,
  isMaterialMonetaryReviewItem,
  materialMonetaryNeedsConfirmation,
} from "./eligibility.js";
import { runDiagnosticEngine } from "./engine.js";
import { assessReadiness } from "./readiness/assess.js";
import { detectEvidenceConflicts } from "./reconciliation/detect.js";
import { buildSnapshot } from "./snapshot.js";
import { line } from "./test-fixtures.js";
import type { SnapshotLineItem } from "./types.js";

function snapLine(overrides: Partial<SnapshotLineItem> & { actualValue: string | null }): SnapshotLineItem {
  return {
    snapshotKey: overrides.snapshotKey ?? "k",
    lineItemId: overrides.lineItemId ?? "l1",
    documentId: overrides.documentId ?? "d1",
    extractionId: "e1",
    statementId: "s1",
    concept: overrides.concept ?? "REVENUE",
    labelRaw: "Revenue",
    rawValue: "100",
    normalizedValue: "100",
    actualValue: overrides.actualValue,
    currency: overrides.currency ?? "USD",
    unitScale: "ACTUAL",
    quality: "HIGH",
    reviewStatus: overrides.reviewStatus ?? "PENDING",
    statementType: "UNKNOWN",
    periodStart: "2024-01-01",
    periodEnd: "2024-12-31",
    periodLabel: "FY2024",
    evidenceReferenceId: null,
    evidenceKey: null,
  };
}

describe("P0-A monetary eligibility contract", () => {
  it("1. excludes PENDING monetary lines from actualValue", () => {
    const snap = buildSnapshot({
      lines: [
        line("REVENUE", "144000", {
          unitScale: "THOUSANDS",
          reviewStatus: "PENDING",
          quantityClass: "MONETARY",
          unitScaleRequiresReview: false,
        }),
      ],
    });
    expect(snap.lines[0]?.normalizedValue).toBe("144000");
    expect(snap.lines[0]?.actualValue).toBeNull();
    expect(snap.warnings.some((w) => /Unconfirmed monetary/i.test(w))).toBe(true);
  });

  it("2. excludes REJECTED monetary lines entirely", () => {
    const snap = buildSnapshot({
      lines: [line("REVENUE", "100", { reviewStatus: "REJECTED" })],
    });
    expect(snap.lines).toHaveLength(0);
  });

  it("3. includes CONFIRMED monetary lines", () => {
    const snap = buildSnapshot({
      lines: [
        line("REVENUE", "144000", {
          unitScale: "THOUSANDS",
          reviewStatus: "CONFIRMED",
          quantityClass: "MONETARY",
        }),
      ],
    });
    expect(snap.lines[0]?.actualValue).toBe("144000000");
  });

  it("4. excludes CORRECTED-but-unconfirmed lines", () => {
    const decision = evaluateMonetaryEligibility({
      concept: "REVENUE",
      quantityClass: "MONETARY",
      reviewStatus: "CORRECTED",
      unitScale: "ACTUAL",
      normalizedValue: "100",
    });
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe("UNCONFIRMED_REVIEW");
    const snap = buildSnapshot({
      lines: [line("REVENUE", "100", { reviewStatus: "CORRECTED" })],
    });
    expect(snap.lines[0]?.actualValue).toBeNull();
  });

  it("5. excludes when scale review is still required", () => {
    const snap = buildSnapshot({
      lines: [
        {
          ...line("REVENUE", "180", { unitScale: "THOUSANDS", reviewStatus: "CONFIRMED" }),
          unitScaleRequiresReview: true,
          quantityClass: "MONETARY",
        },
      ],
    });
    expect(snap.lines[0]?.actualValue).toBeNull();
    expect(snap.warnings.some((w) => /scale/i.test(w))).toBe(true);
  });

  it("6. excludes non-monetary lines regardless of review status", () => {
    const snap = buildSnapshot({
      lines: [
        {
          ...line("GROSS_PROFIT", "60", { reviewStatus: "CONFIRMED" }),
          quantityClass: "PERCENTAGE",
        },
      ],
    });
    expect(snap.lines).toHaveLength(0);
  });

  it("7. excludes UNMAPPED monetary lines", () => {
    const snap = buildSnapshot({
      lines: [line("UNMAPPED", "999", { reviewStatus: "CONFIRMED" })],
    });
    expect(snap.lines).toHaveLength(0);
  });

  it("8. handles duplicate conflicts deterministically (CONFIRMED preferred)", () => {
    const conflicts = detectEvidenceConflicts({
      contentHash: "x",
      currency: "USD",
      periodStart: null,
      periodEnd: null,
      periodLabel: null,
      documentIds: ["d1", "d2"],
      extractionIds: ["e1"],
      warnings: [],
      lines: [
        snapLine({
          snapshotKey: "a",
          lineItemId: "l1",
          documentId: "d1",
          actualValue: "100",
          reviewStatus: "CONFIRMED",
        }),
        snapLine({
          snapshotKey: "b",
          lineItemId: "l2",
          documentId: "d2",
          actualValue: "150",
          reviewStatus: "PENDING",
        }),
      ],
    });
    expect(conflicts).toHaveLength(0);

    const unresolved = detectEvidenceConflicts({
      contentHash: "y",
      currency: "USD",
      periodStart: null,
      periodEnd: null,
      periodLabel: null,
      documentIds: ["d1", "d2"],
      extractionIds: ["e1"],
      warnings: [],
      lines: [
        snapLine({
          snapshotKey: "a",
          lineItemId: "l1",
          documentId: "d1",
          actualValue: "100",
          reviewStatus: "CONFIRMED",
        }),
        snapLine({
          snapshotKey: "b",
          lineItemId: "l2",
          documentId: "d2",
          actualValue: "150",
          reviewStatus: "CONFIRMED",
        }),
      ],
    });
    expect(unresolved).toHaveLength(1);
  });

  it("9. readiness distinguishes material vs contextual pending", () => {
    const blocked = assessReadiness({
      documents: [
        {
          id: "d1",
          processingStatus: "READY",
          scanStatus: "CLEAN",
          deletionStatus: "ACTIVE",
          statementCount: 1,
          lineItemCount: 5,
          pendingReviewCount: 2,
          contextualPendingCount: 4,
          hasCurrency: true,
          hasPeriod: true,
          periodType: "ANNUAL",
          consolidationScope: "ENTITY",
          metadataConfirmed: true,
        },
      ],
      openCriticalReconciliations: 0,
      openHighReconciliations: 0,
    });
    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.issues.some((i) => i.code === "PENDING_REVIEWS" && i.blocking)).toBe(true);
    expect(blocked.issues.some((i) => i.code === "CONTEXTUAL_PENDING" && !i.blocking)).toBe(true);
    expect(blocked.checklist.find((c) => c.id === "reviews_complete")?.required).toBe(true);

    expect(
      isMaterialMonetaryReviewItem({
        concept: "REVENUE",
        quantityClass: "MONETARY",
        reviewStatus: "PENDING",
      }),
    ).toBe(true);
    expect(
      isMaterialMonetaryReviewItem({
        concept: "UNMAPPED",
        quantityClass: "MONETARY",
        reviewStatus: "PENDING",
      }),
    ).toBe(false);
    expect(
      isMaterialMonetaryReviewItem({
        concept: "REVENUE",
        quantityClass: "PERCENTAGE",
        reviewStatus: "PENDING",
      }),
    ).toBe(false);
    expect(
      materialMonetaryNeedsConfirmation({
        concept: "REVENUE",
        quantityClass: "MONETARY",
        reviewStatus: "CONFIRMED",
        unitScaleRequiresReview: true,
      }),
    ).toBe(true);
  });

  it("10. withholds Business Health Score when required inputs are not eligible", () => {
    const snap = buildSnapshot({
      currency: "USD",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      lines: [
        line("REVENUE", "1000", { reviewStatus: "PENDING", quality: "HIGH" }),
        line("NET_PROFIT", "200", { reviewStatus: "PENDING", quality: "HIGH" }),
        line("OPERATING_PROFIT", "250", { reviewStatus: "PENDING", quality: "HIGH" }),
        line("CURRENT_ASSETS", "500", { reviewStatus: "PENDING", quality: "HIGH" }),
        line("CURRENT_LIABILITIES", "200", { reviewStatus: "PENDING", quality: "HIGH" }),
        line("INVENTORY", "50", { reviewStatus: "PENDING", quality: "HIGH" }),
        line("TOTAL_ASSETS", "900", { reviewStatus: "PENDING", quality: "HIGH" }),
        line("TOTAL_LIABILITIES", "300", { reviewStatus: "PENDING", quality: "HIGH" }),
        line("EQUITY", "600", { reviewStatus: "PENDING", quality: "HIGH" }),
        line("OPERATING_CASH_FLOW", "180", { reviewStatus: "PENDING", quality: "HIGH" }),
      ],
    });
    expect(snap.lines.every((l) => l.actualValue == null)).toBe(true);
    const result = runDiagnosticEngine(snap);
    expect(result.metrics.every((m) => m.status !== "COMPUTED" || m.value == null)).toBe(true);
    expect(result.score.status).toBe("INSUFFICIENT_DATA");
    expect(result.score.overallScore).toBeNull();
  });

  it("11. engine outputs cannot treat provisional values as confirmed evidence", () => {
    const mixed = buildSnapshot({
      currency: "USD",
      lines: [
        line("REVENUE", "1000", { reviewStatus: "CONFIRMED" }),
        line("NET_PROFIT", "200", { reviewStatus: "PENDING" }),
      ],
    });
    const revenue = mixed.lines.find((l) => l.concept === "REVENUE");
    const profit = mixed.lines.find((l) => l.concept === "NET_PROFIT");
    expect(revenue?.actualValue).toBe("1000");
    expect(profit?.actualValue).toBeNull();
    const result = runDiagnosticEngine(mixed);
    const netMargin = result.metrics.find((m) => m.code === "NET_MARGIN");
    expect(netMargin?.status === "COMPUTED").toBe(false);
  });

  it("12. preserves cross-period isolation in amounts (only confirmed per period)", () => {
    const snap = buildSnapshot({
      currency: "USD",
      lines: [
        line("REVENUE", "100", {
          reviewStatus: "PENDING",
          periodLabel: "FY2024",
          periodStart: "2024-01-01",
          periodEnd: "2024-12-31",
        }),
        line("REVENUE", "120", {
          reviewStatus: "CONFIRMED",
          periodLabel: "FY2025",
          periodStart: "2025-01-01",
          periodEnd: "2025-12-31",
        }),
      ],
    });
    const fy24 = snap.lines.find((l) => l.periodLabel === "FY2024");
    const fy25 = snap.lines.find((l) => l.periodLabel === "FY2025");
    expect(fy24?.actualValue).toBeNull();
    expect(fy25?.actualValue).toBe("120");
  });
});
