import {
  SYNTHETIC_ENTITLEMENT_CODES,
  SYNTHETIC_ENTITLEMENT_SOURCE_PREFIX,
  type SyntheticEntitlementCode,
} from "@opero/shared";

export type SyntheticEntitlementGateInput = {
  enabled: boolean;
  orgIdsRaw?: string;
  expiresAt?: string;
  now?: Date;
};

export type SyntheticEntitlementGateResult =
  | { ok: true; allowlistedOrgIds: string[] }
  | {
      ok: false;
      code:
        | "SYNTHETIC_ENTITLEMENT_DISABLED"
        | "SYNTHETIC_ENTITLEMENT_WINDOW_CLOSED"
        | "SYNTHETIC_ENTITLEMENT_NOT_CONFIGURED";
      message: string;
    };

/** Parse comma-separated organization UUIDs (trim, drop empties, dedupe). */
export function parseSyntheticEntitlementOrgIds(raw?: string): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Allowlist resolution for revoke-during-shutdown.
 * Does not require SYNTHETIC_ENTITLEMENT_ENABLED.
 */
export function resolveSyntheticEntitlementAllowlist(orgIdsRaw?: string): {
  ok: true;
  allowlistedOrgIds: string[];
} | {
  ok: false;
  code: "SYNTHETIC_ENTITLEMENT_NOT_CONFIGURED";
  message: string;
} {
  const allowlistedOrgIds = parseSyntheticEntitlementOrgIds(orgIdsRaw);
  if (allowlistedOrgIds.length === 0) {
    return {
      ok: false,
      code: "SYNTHETIC_ENTITLEMENT_NOT_CONFIGURED",
      message: "Synthetic entitlement org allowlist is not configured",
    };
  }
  return { ok: true, allowlistedOrgIds };
}

/**
 * Feature-flag + wall-clock window check for **issuance** (no secrets).
 * Organization membership of a specific id is checked by the caller.
 */
export function evaluateSyntheticEntitlementGate(
  input: SyntheticEntitlementGateInput,
): SyntheticEntitlementGateResult {
  if (!input.enabled) {
    return {
      ok: false,
      code: "SYNTHETIC_ENTITLEMENT_DISABLED",
      message: "Synthetic entitlement issuance is disabled",
    };
  }
  const allowlist = resolveSyntheticEntitlementAllowlist(input.orgIdsRaw);
  if (!allowlist.ok) return allowlist;
  if (input.expiresAt) {
    const expiresAt = new Date(input.expiresAt);
    const now = input.now ?? new Date();
    if (Number.isNaN(expiresAt.getTime()) || now.getTime() >= expiresAt.getTime()) {
      return {
        ok: false,
        code: "SYNTHETIC_ENTITLEMENT_WINDOW_CLOSED",
        message: "Synthetic entitlement feature window has expired",
      };
    }
  }
  return { ok: true, allowlistedOrgIds: allowlist.allowlistedOrgIds };
}

/** Deterministic source id — one active MANUAL grant slot per org/report/code. */
export function syntheticEntitlementSourceId(
  organizationId: string,
  reportId: string,
  code: SyntheticEntitlementCode,
): string {
  return `${SYNTHETIC_ENTITLEMENT_SOURCE_PREFIX}${organizationId}:${reportId}:${code}`;
}

export function isSyntheticEntitlementSourceId(sourceId: string): boolean {
  return sourceId.startsWith(SYNTHETIC_ENTITLEMENT_SOURCE_PREFIX);
}

export function isAllowedSyntheticEntitlementCode(
  value: string,
): value is SyntheticEntitlementCode {
  return (SYNTHETIC_ENTITLEMENT_CODES as readonly string[]).includes(value);
}

export { SYNTHETIC_ENTITLEMENT_CODES };
export type { SyntheticEntitlementCode };
