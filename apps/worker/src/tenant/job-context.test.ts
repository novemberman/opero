import { describe, expect, it } from "vitest";
import { assertTenantJobContext } from "./job-context";

describe("assertTenantJobContext", () => {
  it("accepts a validated tenant payload", () => {
    expect(
      assertTenantJobContext({
        organizationId: "11111111-1111-1111-1111-111111111111",
        actorUserId: "22222222-2222-2222-2222-222222222222",
      }),
    ).toEqual({
      organizationId: "11111111-1111-1111-1111-111111111111",
      actorUserId: "22222222-2222-2222-2222-222222222222",
    });
  });

  it("rejects missing organization context", () => {
    expect(() => assertTenantJobContext({ actorUserId: "x" })).toThrow(/tenant context/);
  });
});
