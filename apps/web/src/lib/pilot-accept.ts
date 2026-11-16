/** Pilot bootstrap invitation accept helpers (client-safe; no secrets). */

export const PILOT_ACCEPT_PASSWORD_MIN = 12;
export const PILOT_ACCEPT_PASSWORD_MAX = 200;
export const PILOT_ACCEPT_API_PATH = "/auth/pilot-invitations/accept";

export type PilotAcceptSuccessBody = {
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; slug: string };
};

/** Read invite token from the email link query. Never log the return value. */
export function readPilotInviteTokenFromSearchParams(
  params: Pick<URLSearchParams, "get">,
): string {
  const raw = params.get("token");
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Remove token-bearing query params from the current history entry.
 * Keeps the path so a refresh no longer re-exposes the token in the address bar.
 */
export function stripTokenQueryFromHistory(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("token")) return;
  url.searchParams.delete("token");
  const search = url.searchParams.toString();
  const next = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

export function validatePilotAcceptPasswords(
  password: string,
  confirmPassword: string,
): string | null {
  if (password.length < PILOT_ACCEPT_PASSWORD_MIN) {
    return `Password must be at least ${PILOT_ACCEPT_PASSWORD_MIN} characters`;
  }
  if (password.length > PILOT_ACCEPT_PASSWORD_MAX) {
    return "Password is too long";
  }
  if (password !== confirmPassword) {
    return "Passwords do not match";
  }
  return null;
}

function extractApiError(body: unknown): { message: string; code: string | null } {
  if (!body || typeof body !== "object") {
    return { message: "", code: null };
  }
  const record = body as {
    message?: unknown;
    code?: unknown;
    issues?: unknown;
  };

  let message = "";
  let code: string | null = typeof record.code === "string" ? record.code : null;

  if (typeof record.message === "string") {
    message = record.message;
  } else if (Array.isArray(record.message)) {
    message = record.message.filter((part): part is string => typeof part === "string").join("; ");
  } else if (record.message && typeof record.message === "object") {
    const nested = record.message as { message?: unknown; code?: unknown };
    if (typeof nested.message === "string") message = nested.message;
    if (typeof nested.code === "string") code = nested.code;
  }

  if (!message && Array.isArray(record.issues)) {
    message = record.issues
      .map((issue) => {
        if (!issue || typeof issue !== "object") return "";
        const detail = (issue as { message?: unknown }).message;
        return typeof detail === "string" ? detail : "";
      })
      .filter(Boolean)
      .join("; ");
  }

  return { message, code };
}

/** Map API failures to operator-safe copy (never echo tokens). */
export function pilotInviteErrorMessage(body: unknown, status: number): string {
  const { message, code } = extractApiError(body);

  switch (code) {
    case "PILOT_INVITE_INVALID":
      return "This invitation is invalid, expired, revoked, or has already been used.";
    case "PILOT_INVITE_EMAIL_EXISTS":
      return "An account with this invitation email already exists. Sign in instead.";
    case "PILOT_INVITE_SLUG_EXISTS":
      return "This pilot organization is no longer available. Contact the operator.";
    case "PILOT_USER_LIMIT":
    case "PILOT_ORG_LIMIT":
      return "Pilot capacity has been reached. Contact the operator for access.";
    default:
      break;
  }

  if (status === 400 && /invalid or expired|invitation/i.test(message)) {
    return "This invitation is invalid, expired, revoked, or has already been used.";
  }
  if (status === 409) {
    return message || "This invitation conflicts with an existing account or organization.";
  }
  if (status === 403) {
    return message || "This invitation cannot be accepted right now.";
  }
  if (status >= 500) {
    return "Opero could not complete the invitation. Try again in a moment.";
  }
  return message || "Unable to accept this invitation.";
}

export function pilotAcceptDestination(organizationId: string): string {
  return `/organizations/${organizationId}`;
}
