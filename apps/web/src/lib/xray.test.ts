import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "./api";
import {
  metadataChanges,
  metadataFormValues,
  splitLines,
  type StatementMetadataValues,
} from "./xray";

const stored: StatementMetadataValues = {
  periodType: "UNKNOWN",
  fiscalYearEndMonth: null,
  consolidationScope: "UNKNOWN",
  entityName: null,
  currency: "USD",
  periodStart: "2024-01-01",
  periodEnd: "2024-12-31",
  periodLabel: "FY2024",
};

describe("metadataChanges", () => {
  it("reports nothing when the form still shows the stored values", () => {
    expect(metadataChanges(stored, metadataFormValues(stored))).toEqual({});
  });

  it("sends only edited fields, typed as the API expects", () => {
    const form = {
      ...metadataFormValues(stored),
      periodType: "ANNUAL",
      fiscalYearEndMonth: "12",
      entityName: "  Acme Ltd ",
      currency: "eur",
    };
    expect(metadataChanges(stored, form)).toEqual({
      periodType: "ANNUAL",
      fiscalYearEndMonth: 12,
      entityName: "Acme Ltd",
      currency: "EUR",
    });
  });

  it("clears optional fields with null rather than an empty string", () => {
    const form = { ...metadataFormValues(stored), currency: " ", periodStart: "", periodLabel: "" };
    expect(metadataChanges(stored, form)).toEqual({
      currency: null,
      periodStart: null,
      periodLabel: null,
    });
  });
});

describe("splitLines", () => {
  it("keeps one trimmed entry per non-empty line", () => {
    expect(splitLines(" first \n\n second\n   \n")).toEqual(["first", "second"]);
    expect(splitLines("")).toEqual([]);
  });
});

describe("apiErrorMessage", () => {
  it("uses the API message and appends validation issues", () => {
    expect(apiErrorMessage({ message: "Report not found" }, "fallback")).toBe("Report not found");
    expect(
      apiErrorMessage(
        { message: "Validation failed", issues: [{ path: "reason", message: "Too short" }] },
        "fallback",
      ),
    ).toBe("Validation failed (reason: Too short)");
    expect(apiErrorMessage({ message: ["a", "b"] }, "fallback")).toBe("a; b");
  });

  it("falls back when the body carries no message", () => {
    expect(apiErrorMessage(null, "fallback")).toBe("fallback");
    expect(apiErrorMessage("<html>", "fallback")).toBe("fallback");
    expect(apiErrorMessage({}, "fallback")).toBe("fallback");
  });
});
