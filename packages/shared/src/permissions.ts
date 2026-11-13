import type { MembershipRole } from "./roles";

/**
 * Explicit API permissions. Deny by default — a role must be listed to allow.
 * Frontend checks are convenience only; Nest guards enforce these.
 *
 * Phase 6: xray:publish is OWNER/ADMIN only (approve/publish reports).
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
  ],
  ANALYST: ["org:read", "org:leave", "xray:read", "xray:write"],
  VIEWER: ["org:read", "org:leave", "xray:read"],
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
