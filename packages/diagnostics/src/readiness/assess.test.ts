import { describe, expect, it } from "vitest";
import { assessReadiness } from "./assess.js";
import type { ReadinessInputDocument } from "./types.js";

function doc(overrides: Partial<ReadinessInputDocument> = {}): ReadinessInputDocument {
  return {
    id: "d1",
    processingStatus: "READY",
    scanStatus: "CLEAN",
    deletionStatus: "ACTIVE",
    statementCount: 1,
    lineItemCount: 10,
    pendingReviewCount: 0,
    hasCurrency: true,
    hasPeriod: true,
    periodType: "ANNUAL",
    consolidationScope: "ENTITY",
    metadataConfirmed: true,
    ...overrides,
  };
}

describe("assessReadiness", () => {
  it("returns READY when all gates pass", () => {
    const result = assessReadiness({
      documents: [doc()],
      openCriticalReconciliations: 0,
      openHighReconciliations: 0,
    });
    expect(result.status).toBe("READY");
    expect(result.blockingReasons).toEqual([]);
  });

  it("blocks on missing documents", () => {
    const result = assessReadiness({
      documents: [],
      openCriticalReconciliations: 0,
      openHighReconciliations: 0,
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.blockingReasons.length).toBeGreaterThan(0);
  });

  it("blocks on critical reconciliations and missing currency", () => {
    const result = assessReadiness({
      documents: [doc({ hasCurrency: false })],
      openCriticalReconciliations: 2,
      openHighReconciliations: 0,
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.issues.some((i) => i.code === "CRITICAL_RECONCILIATIONS")).toBe(true);
    expect(result.issues.some((i) => i.code === "MISSING_CURRENCY")).toBe(true);
  });

  it("blocks on material unconfirmed monetary reviews", () => {
    const result = assessReadiness({
      documents: [doc({ pendingReviewCount: 3, metadataConfirmed: true })],
      openCriticalReconciliations: 0,
      openHighReconciliations: 0,
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.blockingReasons).toContain("Unconfirmed material monetary figures");
    expect(result.checklist.find((c) => c.id === "reviews_complete")?.required).toBe(true);
  });

  it("marks ACTION_REQUIRED for unconfirmed metadata without material pending", () => {
    const result = assessReadiness({
      documents: [
        doc({
          pendingReviewCount: 0,
          contextualPendingCount: 2,
          metadataConfirmed: false,
          periodType: "UNKNOWN",
        }),
      ],
      openCriticalReconciliations: 0,
      openHighReconciliations: 1,
    });
    expect(result.status).toBe("ACTION_REQUIRED");
    expect(result.blockingReasons).toEqual([]);
    expect(result.issues.some((i) => i.code === "CONTEXTUAL_PENDING")).toBe(true);
  });
});

