import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PILOT_ACCEPT_API_PATH,
  PILOT_ACCEPT_PASSWORD_MIN,
  pilotAcceptDestination,
  pilotInviteErrorMessage,
  readPilotInviteTokenFromSearchParams,
  stripTokenQueryFromHistory,
  validatePilotAcceptPasswords,
} from "./pilot-accept";

describe("pilot accept helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes the backend accept path used by the email workflow", () => {
    expect(PILOT_ACCEPT_API_PATH).toBe("/auth/pilot-invitations/accept");
  });

  it("reads and trims the invitation token from search params", () => {
    const params = new URLSearchParams("token=%20secret-token-value%20");
    expect(readPilotInviteTokenFromSearchParams(params)).toBe("secret-token-value");
  });

  it("treats a missing token as empty without throwing", () => {
    expect(readPilotInviteTokenFromSearchParams(new URLSearchParams())).toBe("");
  });

  it("strips token query params from history without logging the token", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: {
        href: "https://opero.example/pilot/accept?token=super-secret&x=1",
      },
      history: {
        state: { keep: true },
        replaceState,
      },
    });

    stripTokenQueryFromHistory();

    expect(replaceState).toHaveBeenCalledTimes(1);
    const nextUrl = replaceState.mock.calls[0]?.[2] as string;
    expect(nextUrl).toBe("/pilot/accept?x=1");
    expect(nextUrl).not.toContain("token=");
    expect(nextUrl).not.toContain("super-secret");
  });

  it("enforces password policy and confirmation match", () => {
    expect(validatePilotAcceptPasswords("short", "short")).toMatch(/at least/i);
    expect(
      validatePilotAcceptPasswords("a".repeat(PILOT_ACCEPT_PASSWORD_MIN), "different-password"),
    ).toMatch(/do not match/i);
    expect(
      validatePilotAcceptPasswords(
        "a".repeat(PILOT_ACCEPT_PASSWORD_MIN),
        "a".repeat(PILOT_ACCEPT_PASSWORD_MIN),
      ),
    ).toBeNull();
  });

  it("maps invalid invitation API codes to safe operator copy", () => {
    expect(
      pilotInviteErrorMessage(
        { message: "Invalid or expired pilot invitation", code: "PILOT_INVITE_INVALID" },
        400,
      ),
    ).toMatch(/invalid, expired, revoked/i);

    expect(
      pilotInviteErrorMessage({ message: { message: "nested", code: "PILOT_INVITE_INVALID" } }, 400),
    ).toMatch(/invalid, expired, revoked/i);

    expect(
      pilotInviteErrorMessage({ message: "A user with this email already exists", code: "PILOT_INVITE_EMAIL_EXISTS" }, 409),
    ).toMatch(/already exists/i);
  });

  it("builds the authenticated post-accept destination", () => {
    expect(pilotAcceptDestination("11111111-1111-4111-8111-111111111111")).toBe(
      "/organizations/11111111-1111-4111-8111-111111111111",
    );
  });
});
