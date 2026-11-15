import { describe, expect, it } from "vitest";
import { timingSafeStringEqual } from "./timing-safe-equal";

describe("timingSafeStringEqual", () => {
  it("matches equal strings and rejects unequal or empty mismatches", () => {
    expect(timingSafeStringEqual("pilot-code", "pilot-code")).toBe(true);
    expect(timingSafeStringEqual("pilot-code", "other-code")).toBe(false);
    expect(timingSafeStringEqual("short", "longer-value")).toBe(false);
    expect(timingSafeStringEqual("", "x")).toBe(false);
  });
});
