import type { MembershipRole } from "./roles";

/**
 * Explicit API permissions. Deny by default — a role must be listed to allow.
 * Frontend checks are convenience only; Nest guards enforce these.
 *
 * Phase 6: xray:publish is OWNER/ADMIN only (approve/publish reports).
 * Phase 7A: billing:manage is OWNER/ADMIN only; billing:read includes VIEWER.
 * Commercial entitlements are separate — see entitlements.ts.
 */
export const permissions = [
  "org:read",
  "org:update",
  "member:invite",
  "member:remove",
  "member:change_role",
  "invite:revoke",
  "org:leave",
  "xray:read",
  "xray:write",
  "xray:publish",
  "billing:read",
  "billing:manage",
] as const;

export type Permission = (typeof permissions)[number];

export const rolePermissions: Record<MembershipRole, readonly Permission[]> = {
  OWNER: [
    "org:read",
    "org:update",
    "member:invite",
    "member:remove",
    "member:change_role",
    "invite:revoke",
    "org:leave",
    "xray:read",
    "xray:write",
    "xray:publish",
    "billing:read",
    "billing:manage",
  ],
  ADMIN: [
    "org:read",
    "org:update",
    "member:invite",
    "member:remove",
    "member:change_role",
    "invite:revoke",
    "org:leave",
    "xray:read",
    "xray:write",
    "xray:publish",
    "billing:read",
    "billing:manage",
  ],
  ANALYST: ["org:read", "org:leave", "xray:read", "xray:write", "billing:read"],
  VIEWER: ["org:read", "org:leave", "xray:read", "billing:read"],
};

export function roleHasPermission(role: MembershipRole, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

export function roleHasEveryPermission(
  role: MembershipRole,
  required: readonly Permission[],
): boolean {
  return required.every((permission) => roleHasPermission(role, permission));
}
