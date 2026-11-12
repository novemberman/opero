/**
 * Background jobs that touch tenant data must carry a validated organizationId.
 * The worker must not trust a client-supplied org id without membership checks
 * performed by the enqueueing API (SessionAuthGuard + OrgMembershipGuard).
 *
 * Future X-Ray jobs should reuse this shape and reject payloads missing org context.
 */
export type TenantJobContext = {
  organizationId: string;
  actorUserId: string;
};

export function assertTenantJobContext(value: unknown): TenantJobContext {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as TenantJobContext).organizationId !== "string" ||
    typeof (value as TenantJobContext).actorUserId !== "string" ||
    (value as TenantJobContext).organizationId.length === 0 ||
    (value as TenantJobContext).actorUserId.length === 0
  ) {
    throw new Error("Job payload missing validated tenant context");
  }
  return value as TenantJobContext;
}
