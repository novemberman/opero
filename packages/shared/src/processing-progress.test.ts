import { describe, expect, it } from "vitest";
import { buildProcessingProgress } from "./processing-progress";

describe("buildProcessingProgress", () => {
  it("never reports 100% while review is required", () => {
    const progress = buildProcessingProgress({
      documentId: "d1",
      organizationId: "o1",
      processingStatus: "REVIEW_REQUIRED",
      scanStatus: "CLEAN",
      extractionStatus: "SUCCEEDED",
    });
    expect(progress.progressPercent).toBe(80);
    expect(progress.humanActionRequired).toBe(true);
    expect(progress.currentStage).toBe("AWAITING_REVIEW");
  });

  it("maps scanning and extracting stages", () => {
    expect(
      buildProcessingProgress({
        documentId: "d1",
        organizationId: "o1",
        processingStatus: "SCANNING",
        scanStatus: "PENDING",
        extractionStatus: "PENDING",
      }).currentStage,
    ).toBe("SECURITY_SCANNING");
    expect(
      buildProcessingProgress({
        documentId: "d1",
        organizationId: "o1",
        processingStatus: "EXTRACTING",
        scanStatus: "CLEAN",
        extractionStatus: "RUNNING",
      }).currentStage,
    ).toBe("IDENTIFYING_FIGURES");
  });

  it("marks diagnostics stages skipped at document READY", () => {
    const progress = buildProcessingProgress({
      documentId: "d1",
      organizationId: "o1",
      processingStatus: "READY",
      scanStatus: "CLEAN",
      extractionStatus: "SUCCEEDED",
    });
    expect(progress.progressPercent).toBe(100);
    expect(progress.stages.find((s) => s.id === "CALCULATING_DIAGNOSTICS")?.status).toBe("SKIPPED");
  });
});
