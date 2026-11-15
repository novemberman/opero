import { describe, expect, it } from "vitest";
import { buildSnapshot } from "./snapshot.js";
import { line } from "./test-fixtures.js";

describe("snapshot", () => {
  it("hashes deterministically and drops rejected lines", () => {
    const shared = {
      lineItemId: "00000000-0000-4000-8000-000000000099",
      documentId: "00000000-0000-4000-8000-0000000000d1",
      extractionId: "00000000-0000-4000-8000-0000000000e1",
      statementId: "00000000-0000-4000-8000-0000000000s1",
    };
    const a = buildSnapshot({
      currency: "USD",
      lines: [
        line("REVENUE", "100", shared),
        line("NET_PROFIT", "10", { reviewStatus: "REJECTED" }),
      ],
    });
    const b = buildSnapshot({
      currency: "USD",
      lines: [line("REVENUE", "100", shared)],
    });
    expect(a.lines.some((l) => l.concept === "NET_PROFIT")).toBe(false);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("scales thousands into actual units when confirmed", () => {
    const snap = buildSnapshot({
      lines: [line("REVENUE", "2.5", { unitScale: "THOUSANDS", reviewStatus: "CONFIRMED" })],
    });
    expect(snap.lines[0]?.actualValue).toBe("2500");
  });

  it("withholds Netshift-style PENDING Revenue even when thousands scale is known", () => {
    const snap = buildSnapshot({
      currency: "NGN",
      lines: [
        {
          ...line("REVENUE", "144000", {
            unitScale: "THOUSANDS",
            reviewStatus: "PENDING",
          }),
          labelRaw: "Revenue of",
          rawValue: "144,000",
          quantityClass: "MONETARY",
          unitScaleRequiresReview: false,
        },
      ],
    });
    expect(snap.lines[0]?.normalizedValue).toBe("144000");
    expect(snap.lines[0]?.actualValue).toBeNull();
  });

  it("scales confirmed Netshift FY2024 Revenue 144,000 thousands to NGN 144,000,000", () => {
    const snap = buildSnapshot({
      currency: "NGN",
      lines: [
        {
          ...line("REVENUE", "144000", {
            unitScale: "THOUSANDS",
            reviewStatus: "CONFIRMED",
          }),
          labelRaw: "Revenue of",
          rawValue: "144,000",
          quantityClass: "MONETARY",
          unitScaleRequiresReview: false,
        },
      ],
    });
    expect(snap.lines[0]?.actualValue).toBe("144000000");
  });

  it("withholds absolute values when monetary scale still requires review", () => {
    const confirmed = buildSnapshot({
      lines: [line("REVENUE", "180", { unitScale: "THOUSANDS", reviewStatus: "CONFIRMED" })],
    });
    const blocked = buildSnapshot({
      lines: [
        {
          ...line("REVENUE", "180", { unitScale: "THOUSANDS", reviewStatus: "CONFIRMED" }),
          unitScaleRequiresReview: true,
          quantityClass: "MONETARY",
        },
      ],
    });
    expect(blocked.lines[0]?.actualValue).toBeNull();
    expect(blocked.warnings.some((w) => /Unconfirmed monetary scale/i.test(w))).toBe(true);
    expect(confirmed.lines[0]?.actualValue).toBe("180000");
  });

  it("excludes non-monetary quantity classes from the snapshot", () => {
    const snap = buildSnapshot({
      lines: [
        {
          ...line("GROSS_PROFIT", "60", { unitScale: "ACTUAL", reviewStatus: "CONFIRMED" }),
          quantityClass: "PERCENTAGE",
        },
      ],
    });
    expect(snap.lines).toHaveLength(0);
  });
});
