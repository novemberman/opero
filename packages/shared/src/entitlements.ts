/**
 * Commercial entitlement codes — orthogonal to RBAC permissions.
 * A caller must satisfy both membership permissions and entitlements.
 */
export const entitlementCodes = [
  "xray.preview",
  "xray.full_report",
  "xray.pdf_download",
  "xray.report_generate",
  "os.seats",
  "os.monitoring",
] as const;

export type EntitlementCode = (typeof entitlementCodes)[number];

/**
 * Free-versus-paid access policy (server-enforced).
 *
 * FREE (authenticated organization members):
 * - Document upload and readiness assessment
 * - Basic diagnostic coverage and limited KPI preview
 * - General findings summary
 * - Draft / review report workflow (create, version, submit, approve) — no PDF
 *
 * PAID (X-Ray Pro purchase for a report, or active OS subscription):
 * - PDF generation / publication (`xray.report_generate`)
 * - Full published report payload / AI narrative detail (`xray.full_report`)
 * - Published PDF download (`xray.pdf_download`)
 *
 * A browser redirect or unverified payment status never grants these codes.
 * Expired subscriptions do not unlock previously paid org-wide content unless a
 * separate report purchase entitlement remains valid.
 */
export const FREE_TIER_ENTITLEMENTS: readonly EntitlementCode[] = ["xray.preview"];

export const XRAY_PRO_ENTITLEMENTS: readonly EntitlementCode[] = [
  "xray.report_generate",
  "xray.full_report",
  "xray.pdf_download",
];

export function isEntitlementCode(value: string): value is EntitlementCode {
  return (entitlementCodes as readonly string[]).includes(value);
}
