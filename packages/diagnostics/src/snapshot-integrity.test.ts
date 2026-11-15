import { describe, expect, it } from "vitest";
import { assessSnapshotPayloadIntegrity } from "./snapshot-integrity.js";

describe("assessSnapshotPayloadIntegrity", () => {
  it("treats confirmed-only amounts as authoritative", () => {
    const result = assessSnapshotPayloadIntegrity({
      lines: [
        { concept: "REVENUE", reviewStatus: "CONFIRMED", actualValue: "1000" },
        { concept: "NET_PROFIT", reviewStatus: "PENDING", actualValue: null },
      ],
    });
    expect(result).toEqual({
      authoritative: true,
      code: "OK",
      contaminatedLineCount: 0,
      detail: null,
    });
  });

  it("flags PENDING amounts as non-authoritative without rewriting", () => {
    const result = assessSnapshotPayloadIntegrity({
      lines: [
        { concept: "REVENUE", reviewStatus: "PENDING", actualValue: "144000000" },
        { concept: "NET_PROFIT", reviewStatus: "CONFIRMED", actualValue: "30000000" },
      ],
    });
    expect(result.authoritative).toBe(false);
    expect(result.code).toBe("UNCONFIRMED_AMOUNTS_IN_SNAPSHOT");
    expect(result.contaminatedLineCount).toBe(1);
  });

  it("flags legacy CORRECTED amounts as non-authoritative", () => {
    const result = assessSnapshotPayloadIntegrity({
      lines: [{ concept: "REVENUE", reviewStatus: "CORRECTED", actualValue: "100" }],
    });
    expect(result.authoritative).toBe(false);
    expect(result.contaminatedLineCount).toBe(1);
  });

  it("ignores malformed payloads safely", () => {
    expect(assessSnapshotPayloadIntegrity(null).authoritative).toBe(true);
    expect(assessSnapshotPayloadIntegrity({}).authoritative).toBe(true);
    expect(assessSnapshotPayloadIntegrity({ lines: "nope" }).authoritative).toBe(true);
  });
});
