import type { MembershipRole } from "./roles";

/**
 * Explicit API permissions. Deny by default — a role must be listed to allow.
 * Frontend checks are convenience only; Nest guards enforce these.
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
