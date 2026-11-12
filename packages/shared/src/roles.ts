import { z } from "zod";

/**
 * Membership roles stored on Membership.role.
 * Keep this list aligned with the MembershipRole enum in packages/database.
 * These names are a shared contract, not an authorization implementation.
 */
export const membershipRoles = ["OWNER", "ADMIN", "ANALYST", "VIEWER"] as const;

export const membershipRoleSchema = z.enum(membershipRoles);

export type MembershipRole = z.infer<typeof membershipRoleSchema>;

/** Roles that may be assigned via invitation or role change (not self-serve OWNER promotion). */
export const assignableMembershipRoles = ["ADMIN", "ANALYST", "VIEWER"] as const;

export const assignableMembershipRoleSchema = z.enum(assignableMembershipRoles);

export type AssignableMembershipRole = z.infer<typeof assignableMembershipRoleSchema>;
