import { z } from "zod";

export {
  assignableMembershipRoleSchema,
  assignableMembershipRoles,
  membershipRoleSchema,
  membershipRoles,
  type AssignableMembershipRole,
  type MembershipRole,
} from "./roles";

export {
  permissions,
  roleHasEveryPermission,
  roleHasPermission,
  rolePermissions,
  type Permission,
} from "./permissions";

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

export const registerBodySchema = z
  .object({
    email: z.email().max(320),
    name: z.string().trim().min(1).max(120),
    password: z.string().min(12).max(200),
  })
  .strict();

export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z
  .object({
    email: z.email().max(320),
    password: z.string().min(1).max(200),
  })
  .strict();

export type LoginBody = z.infer<typeof loginBodySchema>;

export const verifyEmailBodySchema = z
  .object({
    token: z.string().min(1).max(500),
  })
  .strict();

export const forgotPasswordBodySchema = z
  .object({
    email: z.email().max(320),
  })
  .strict();

export const resetPasswordBodySchema = z
  .object({
    token: z.string().min(1).max(500),
    password: z.string().min(12).max(200),
  })
  .strict();

export const createOrganizationBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens"),
  })
  .strict();

export type CreateOrganizationBody = z.infer<typeof createOrganizationBodySchema>;

export const updateOrganizationBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export const inviteMemberBodySchema = z
  .object({
    email: z.email().max(320),
    role: z.enum(["ADMIN", "ANALYST", "VIEWER"]),
  })
  .strict();

export const changeMemberRoleBodySchema = z
  .object({
    role: z.enum(["OWNER", "ADMIN", "ANALYST", "VIEWER"]),
  })
  .strict();

export const acceptInvitationBodySchema = z
  .object({
    token: z.string().min(1).max(500),
    name: z.string().trim().min(1).max(120).optional(),
    password: z.string().min(12).max(200).optional(),
  })
  .strict();
