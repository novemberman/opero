import { describe, expect, it } from "vitest";
import { buildOrgBillingReturnPath } from "./billing-return";

describe("buildOrgBillingReturnPath", () => {
  it("includes reference and optional reportId", () => {
    expect(
      buildOrgBillingReturnPath({
        organizationId: "org-1",
        reference: "opero_abc",
        reportId: "rep-1",
      }),
    ).toBe("/organizations/org-1/billing?reference=opero_abc&reportId=rep-1");
  });

  it("omits reportId when absent", () => {
    expect(
      buildOrgBillingReturnPath({
        organizationId: "org-1",
        reference: "opero_abc",
      }),
    ).toBe("/organizations/org-1/billing?reference=opero_abc");
  });
});
