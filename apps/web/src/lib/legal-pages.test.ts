import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webSrc = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(webSrc, rel), "utf8");
}

describe("PR-1 legal pages and navigation", () => {
  const legalPages = ["terms", "privacy", "financial-disclaimers", "payments"] as const;

  it("renders draft banner and placeholders without fabricated entity identity", () => {
    for (const page of legalPages) {
      const source = read(`app/legal/${page}/page.tsx`);
      expect(source).toMatch(/LegalDoc/);
      expect(source).toMatch(/\(Draft\)|Draft/);
      expect(source).not.toMatch(/RC\s*\d{5,}/i);
      expect(source).not.toMatch(/Limited by Guarantee|CAC\s*Number/i);
    }

    expect(read("app/legal/terms/page.tsx")).toMatch(/\[OPERATOR_LEGAL_NAME\]/);
    expect(read("app/legal/privacy/page.tsx")).toMatch(/\[PRIVACY_REQUEST_EMAIL_PLACEHOLDER\]/);
    expect(read("app/legal/payments/page.tsx")).toMatch(/\[REFUND_POLICY_PLACEHOLDER\]/);

    const shell = read("components/legal/legal-doc.tsx");
    expect(shell).toMatch(/not approved production policy|Draft — not approved/i);
    expect(shell).toMatch(/mandatory click-wrap/i);
    expect(shell).toMatch(/\[OPERATOR_LEGAL_NAME\]/);

    const layout = read("app/legal/layout.tsx");
    expect(layout).toMatch(/index:\s*false/);
  });

  it("links legal pages from registration, login, checkout, and footer", () => {
    expect(read("app/register/page.tsx")).toMatch(/\/legal\/terms/);
    expect(read("app/register/page.tsx")).toMatch(/LegalLinksInline|\/legal\/privacy/);
    expect(read("app/login/page.tsx")).toMatch(/LegalLinksInline/);
    expect(read("app/organizations/[orgId]/reports/[reportId]/unlock/page.tsx")).toMatch(
      /\/legal\/payments/,
    );
    expect(read("app/organizations/[orgId]/billing/page.tsx")).toMatch(/\/legal\/payments/);
    expect(read("components/marketing/public-footer.tsx")).toMatch(/\/legal\/terms/);
    expect(read("components/marketing/public-footer.tsx")).toMatch(/\/legal\/privacy/);
  });

  it("does not introduce a mandatory consent checkbox on registration", () => {
    const register = read("app/register/page.tsx");
    expect(register).not.toMatch(/type=["']checkbox["']/i);
    expect(register).not.toMatch(/I agree to the Terms/i);
    expect(register).toMatch(/not yet mandatory consent/i);
  });

  it("exposes the four draft routes under app/legal", () => {
    const dirs = readdirSync(join(webSrc, "app/legal"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const page of legalPages) {
      expect(dirs).toContain(page);
    }
  });
});
