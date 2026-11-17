import { describe, expect, it } from "vitest";
import { isCsrfExemptPath } from "./csrf.middleware";

describe("isCsrfExemptPath", () => {
  it("exempts exact allowlisted auth and health routes with or without /api/v1", () => {
    expect(isCsrfExemptPath("/api/v1/auth/login")).toBe(true);
    expect(isCsrfExemptPath("/auth/login")).toBe(true);
    expect(isCsrfExemptPath("/api/v1/health")).toBe(true);
    expect(isCsrfExemptPath("/health")).toBe(true);
    expect(isCsrfExemptPath("/api/v1/billing/webhooks/korapay")).toBe(true);
  });

  it("exempts nested ops invitation and docs children only", () => {
    expect(isCsrfExemptPath("/api/v1/ops/pilot-invitations")).toBe(true);
    expect(isCsrfExemptPath("/api/v1/ops/pilot-invitations/x/revoke")).toBe(true);
    expect(isCsrfExemptPath("/api/v1/docs/swagger")).toBe(true);
  });

  it("does not exempt unrelated paths that merely end with an allowlisted suffix", () => {
    expect(isCsrfExemptPath("/api/v1/organizations/acme/health")).toBe(false);
    expect(isCsrfExemptPath("/api/v1/organizations/acme/ready")).toBe(false);
    expect(isCsrfExemptPath("/api/v1/organizations/acme/documents/review")).toBe(false);
    expect(isCsrfExemptPath("/api/v1/billing/checkout")).toBe(false);
    expect(isCsrfExemptPath("/api/v1/ops/status")).toBe(false);
  });
});
