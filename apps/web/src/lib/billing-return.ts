/** Build org billing destination after Korapay redirects to `/billing/return?reference=`. */
export function buildOrgBillingReturnPath(input: {
  organizationId: string;
  reference: string;
  reportId?: string | null;
}): string {
  const params = new URLSearchParams({ reference: input.reference });
  if (input.reportId) params.set("reportId", input.reportId);
  return `/organizations/${input.organizationId}/billing?${params.toString()}`;
}
