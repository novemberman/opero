import { describe, expect, it } from "vitest";
import { documentStatusLabel, documentStatusTone } from "./document-status-labels";

describe("document-status-labels", () => {
  it("converts raw processing codes into readable labels", () => {
    expect(documentStatusLabel("processing", "REVIEW_REQUIRED")).toBe("Review required");
    expect(documentStatusLabel("processing", "READY")).toBe("Ready");
    expect(documentStatusLabel("processing", "EXTRACTING")).toBe("Extracting");
  });

  it("labels scan and extraction statuses separately", () => {
    expect(documentStatusLabel("scan", "CLEAN")).toBe("Clean");
    expect(documentStatusLabel("scan", "INFECTED")).toBe("Infected");
    expect(documentStatusLabel("extraction", "SUCCEEDED")).toBe("Succeeded");
    expect(documentStatusLabel("extraction", "FAILED")).toBe("Failed");
  });

  it("falls back for unknown codes without losing readability", () => {
    expect(documentStatusLabel("processing", "CUSTOM_STATUS")).toBe("Custom Status");
  });

  it("maps tones for success, warning and error states", () => {
    expect(documentStatusTone("READY")).toBe("success");
    expect(documentStatusTone("REVIEW_REQUIRED")).toBe("warning");
    expect(documentStatusTone("FAILED")).toBe("error");
  });
});
