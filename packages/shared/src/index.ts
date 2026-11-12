import { z } from "zod";

/**
 * Membership roles stored on Membership.role.
 * Keep this list aligned with the MembershipRole enum in packages/database.
 * These names are a shared contract, not an authorization implementation.
 */
export const membershipRoles = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;

export const membershipRoleSchema = z.enum(membershipRoles);

export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const healthServiceSchema = z.enum(["web", "api", "worker"]);

export type HealthServiceName = z.infer<typeof healthServiceSchema>;

export const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: healthServiceSchema,
    timestamp: z.iso.datetime(),
  })
  .strict();

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export function createHealthResponse(
  service: HealthServiceName,
  now: Date = new Date(),
): HealthResponse {
  return healthResponseSchema.parse({
    status: "ok",
    service,
    timestamp: now.toISOString(),
  });
}
