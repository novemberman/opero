import { describe, expect, it } from "vitest";
import { WORKSPACE_NAV, breadcrumbsForPath } from "./nav-config";

describe("workspace nav config", () => {
  const orgId = "org-123";

  it("matches overview only on the org root", () => {
    const overview = WORKSPACE_NAV.find((item) => item.id === "overview")!;
    expect(overview.match(`/organizations/${orgId}`, orgId)).toBe(true);
    expect(overview.match(`/organizations/${orgId}/documents`, orgId)).toBe(false);
  });

  it("matches nested document routes", () => {
    const documents = WORKSPACE_NAV.find((item) => item.id === "documents")!;
    expect(documents.match(`/organizations/${orgId}/documents`, orgId)).toBe(true);
    expect(documents.match(`/organizations/${orgId}/documents/doc-1`, orgId)).toBe(true);
  });

  it("builds breadcrumbs for nested paths", () => {
    expect(breadcrumbsForPath(`/organizations/${orgId}`, orgId, "Acme")).toEqual([
      { label: "Acme", href: `/organizations/${orgId}` },
    ]);
    expect(breadcrumbsForPath(`/organizations/${orgId}/reports/r1`, orgId, "Acme")).toEqual([
      { label: "Acme", href: `/organizations/${orgId}` },
      { label: "Reports", href: `/organizations/${orgId}/reports` },
    ]);
  });

  it("covers required product areas", () => {
    const ids = WORKSPACE_NAV.map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "overview",
        "documents",
        "diagnostics",
        "readiness",
        "reconciliations",
        "ai",
        "reports",
        "billing",
        "members",
        "settings",
      ]),
    );
  });
});
