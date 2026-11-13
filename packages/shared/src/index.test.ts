import { describe, expect, it } from "vitest";
import {
  createHealthResponse,
  healthResponseSchema,
  membershipRoleSchema,
  membershipRoles,
} from "./index";

describe("membershipRoleSchema", () => {
  it("accepts the explicit organization roles", () => {
    for (const role of membershipRoles) {
      expect(membershipRoleSchema.parse(role)).toBe(role);
    }
  });

  it("rejects an unknown role", () => {
    expect(membershipRoleSchema.safeParse("SUPERUSER").success).toBe(false);
  });
});

describe("healthResponseSchema", () => {
  it("accepts a health payload produced by the shared helper", () => {
    const now = new Date("2026-11-12T18:00:00.000Z");
    const payload = createHealthResponse("api", now, "1.2.3");

    expect(payload).toEqual({
      status: "ok",
      service: "api",
      timestamp: "2026-11-12T18:00:00.000Z",
      version: "1.2.3",
    });
    expect(healthResponseSchema.parse(payload)).toEqual(payload);
  });

  it("rejects a missing service and an unexpected property", () => {
    expect(
      healthResponseSchema.safeParse({
        status: "ok",
        timestamp: "2026-11-12T18:00:00.000Z",
      }).success,
    ).toBe(false);

    expect(
      healthResponseSchema.safeParse({
        status: "ok",
        service: "web",
        timestamp: "2026-11-12T18:00:00.000Z",
        insight: "not a diagnostic",
      }).success,
    ).toBe(false);
  });
});
