import { describe, expect, it } from "vitest";
import { formatNgnFromMinor, majorToMinorUnits, minorToMajorUnits } from "./amount.js";

describe("NGN amount conversion", () => {
  it("converts kobo to naira for Korapay major units", () => {
    expect(minorToMajorUnits(1_500_000, "NGN")).toBe(15_000);
    expect(majorToMinorUnits(15_000, "NGN")).toBe(1_500_000);
  });

  it("formats NGN for display", () => {
    expect(formatNgnFromMinor(1_500_000)).toContain("15");
  });
});
