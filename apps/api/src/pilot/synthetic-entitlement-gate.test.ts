import { describe, expect, it } from "vitest";
import {
  evaluateSyntheticEntitlementGate,
  parseSyntheticEntitlementOrgIds,
  resolveSyntheticEntitlementAllowlist,
  syntheticEntitlementSourceId,
} from "./synthetic-entitlement-gate";

describe("synthetic entitlement gate", () => {
  it("parses and dedupes org allowlist ids", () => {
    expect(parseSyntheticEntitlementOrgIds(undefined)).toEqual([]);
    expect(
      parseSyntheticEntitlementOrgIds(
        " 11111111-1111-4111-8111-111111111111,11111111-1111-4111-8111-111111111111, 22222222-2222-4222-8222-222222222222 ",
      ),
    ).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("is disabled by default semantics for issuance", () => {
    const gate = evaluateSyntheticEntitlementGate({
      enabled: false,
      orgIdsRaw: "11111111-1111-4111-8111-111111111111",
    });
    expect(gate).toMatchObject({ ok: false, code: "SYNTHETIC_ENTITLEMENT_DISABLED" });
  });

  it("still resolves allowlist for revoke-during-shutdown when flag is off", () => {
    const allowlist = resolveSyntheticEntitlementAllowlist(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(allowlist.ok).toBe(true);
    if (allowlist.ok) {
      expect(allowlist.allowlistedOrgIds).toEqual(["11111111-1111-4111-8111-111111111111"]);
    }
  });

  it("requires an allowlist when enabled", () => {
    const gate = evaluateSyntheticEntitlementGate({ enabled: true, orgIdsRaw: " , " });
    expect(gate).toMatchObject({ ok: false, code: "SYNTHETIC_ENTITLEMENT_NOT_CONFIGURED" });
  });

  it("closes when the feature window expires", () => {
    const gate = evaluateSyntheticEntitlementGate({
      enabled: true,
      orgIdsRaw: "11111111-1111-4111-8111-111111111111",
      expiresAt: "2020-01-01T00:00:00.000Z",
      now: new Date("2026-11-17T00:00:00.000Z"),
    });
    expect(gate).toMatchObject({ ok: false, code: "SYNTHETIC_ENTITLEMENT_WINDOW_CLOSED" });
  });

  it("opens when enabled with allowlist and future expiry", () => {
    const gate = evaluateSyntheticEntitlementGate({
      enabled: true,
      orgIdsRaw: "11111111-1111-4111-8111-111111111111",
      expiresAt: "2099-01-01T00:00:00.000Z",
      now: new Date("2026-11-17T00:00:00.000Z"),
    });
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.allowlistedOrgIds).toEqual(["11111111-1111-4111-8111-111111111111"]);
    }
  });

  it("builds a deterministic per-capability synthetic source id", () => {
    expect(
      syntheticEntitlementSourceId(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "xray.report_generate",
      ),
    ).toBe(
      "synthetic_test:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:xray.report_generate",
    );
    expect(
      syntheticEntitlementSourceId(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "xray.pdf_download",
      ),
    ).toBe(
      "synthetic_test:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:xray.pdf_download",
    );
  });
});
