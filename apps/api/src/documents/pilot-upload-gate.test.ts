import { describe, expect, it } from "vitest";
import { assertPilotUploadAllowed, pilotUploadWindowOpen } from "./pilot-upload-gate";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const future = "2099-01-01T00:00:00.000Z";
const past = "2020-01-01T00:00:00.000Z";

describe("assertPilotUploadAllowed", () => {
  it("lets emergency kill switch win even when the pilot window is open", () => {
    expect(() =>
      assertPilotUploadAllowed({
        organizationId: ORG,
        emergencyDisableUploads: true,
        pilotUploadEnabled: true,
        pilotUploadOrgId: ORG,
        pilotUploadExpiresAt: future,
      }),
    ).toThrow(/EMERGENCY_DISABLE_UPLOADS|temporarily disabled/i);
  });

  it("allows uploads when emergency is off and pilot window is disabled (non-window mode)", () => {
    expect(() =>
      assertPilotUploadAllowed({
        organizationId: ORG,
        emergencyDisableUploads: false,
        pilotUploadEnabled: false,
      }),
    ).not.toThrow();
  });

  it("rejects missing allowlist configuration when pilot upload is enabled", () => {
    expect(() =>
      assertPilotUploadAllowed({
        organizationId: ORG,
        emergencyDisableUploads: false,
        pilotUploadEnabled: true,
      }),
    ).toThrow(/PILOT_UPLOAD_NOT_CONFIGURED|not configured/i);
  });

  it("rejects expired windows using server time", () => {
    expect(() =>
      assertPilotUploadAllowed({
        organizationId: ORG,
        emergencyDisableUploads: false,
        pilotUploadEnabled: true,
        pilotUploadOrgId: ORG,
        pilotUploadExpiresAt: past,
        now: new Date("2026-11-16T16:00:00.000Z"),
      }),
    ).toThrow(/PILOT_UPLOAD_EXPIRED|expired/i);
  });

  it("rejects non-allowlisted organizations", () => {
    expect(() =>
      assertPilotUploadAllowed({
        organizationId: OTHER,
        emergencyDisableUploads: false,
        pilotUploadEnabled: true,
        pilotUploadOrgId: ORG,
        pilotUploadExpiresAt: future,
      }),
    ).toThrow(/PILOT_UPLOAD_FORBIDDEN|not authorized/i);
  });

  it("accepts the allowlisted organization during an open window", () => {
    expect(() =>
      assertPilotUploadAllowed({
        organizationId: ORG,
        emergencyDisableUploads: false,
        pilotUploadEnabled: true,
        pilotUploadOrgId: ORG,
        pilotUploadExpiresAt: future,
        now: new Date("2026-11-16T16:00:00.000Z"),
      }),
    ).not.toThrow();
  });
});

describe("pilotUploadWindowOpen", () => {
  it("is false when emergency is on or pilot flag is off", () => {
    expect(
      pilotUploadWindowOpen({
        emergencyDisableUploads: true,
        pilotUploadEnabled: true,
        pilotUploadOrgId: ORG,
        pilotUploadExpiresAt: future,
      }),
    ).toBe(false);
    expect(
      pilotUploadWindowOpen({
        emergencyDisableUploads: false,
        pilotUploadEnabled: false,
        pilotUploadOrgId: ORG,
        pilotUploadExpiresAt: future,
      }),
    ).toBe(false);
  });

  it("is true only for a configured, unexpired window", () => {
    expect(
      pilotUploadWindowOpen({
        emergencyDisableUploads: false,
        pilotUploadEnabled: true,
        pilotUploadOrgId: ORG,
        pilotUploadExpiresAt: future,
        now: new Date("2026-11-16T16:00:00.000Z"),
      }),
    ).toBe(true);
  });
});
