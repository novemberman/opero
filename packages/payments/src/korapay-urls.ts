/** Relative path under the API base (`/api/v1`). No secrets. */
export const KORAPAY_WEBHOOK_PATH = "/billing/webhooks/korapay";

/**
 * Builds the Korapay `notification_url` from a public API base.
 * Example base: `https://api.example.com/api/v1`
 * Result: `https://api.example.com/api/v1/billing/webhooks/korapay`
 */
export function buildKorapayNotificationUrl(webhookBaseUrl: string | null | undefined): string | undefined {
  if (!webhookBaseUrl) return undefined;
  const base = webhookBaseUrl.replace(/\/$/, "");
  if (!/^https?:\/\//i.test(base)) {
    throw new Error("BILLING_WEBHOOK_BASE_URL must be an absolute http(s) URL");
  }
  return `${base}${KORAPAY_WEBHOOK_PATH}`;
}

/**
 * Korapay initialize `amount` is documented as a number in major units.
 * Prefer whole integers for whole-naira NGN prices to match Checkout Redirect docs.
 */
export function korapayAmountMajor(amountMinor: number, currency: string): number {
  const major = amountMinor / 100;
  if (currency.toUpperCase() === "NGN" && Number.isInteger(major)) {
    return major;
  }
  return Number(major.toFixed(2));
}
