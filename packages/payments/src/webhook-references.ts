/**
 * Extract the Opero payment reference from a Korapay webhook `data` object.
 *
 * Documented shapes (do not invent event names):
 * - charge.* → data.reference (merchant/charge reference)
 * - refund.* → data.payment_reference (original charge); data.reference is refund id
 * - chargeback.* → data.payment.reference and/or data.payment_reference;
 *   data.reference is the chargeback id (KPY-CHG-…), not the payment
 *
 * Source: https://developers.korapay.com/docs/webhooks
 *         https://developers.korapay.com/docs/chargebacks
 */
export function extractKorapayWebhookPaymentReference(
  eventType: string,
  data: unknown,
): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;

  if (eventType.startsWith("refund.")) {
    return stringField(d.payment_reference) || stringField(d.reference);
  }

  if (eventType.startsWith("chargeback.")) {
    const payment = d.payment;
    if (payment && typeof payment === "object") {
      const nested = stringField((payment as Record<string, unknown>).reference);
      if (nested) return nested;
    }
    return (
      stringField(d.payment_reference) ||
      stringField(d.transaction_reference) ||
      ""
    );
  }

  return stringField(d.reference) || stringField(d.payment_reference);
}

/** Chargeback id for dedupe (not the payment reference). */
export function extractKorapayChargebackReference(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  return stringField((data as Record<string, unknown>).reference);
}

export const KORAPAY_CHARGEBACK_EVENTS = [
  "chargeback.pending",
  "chargeback.declined",
  "chargeback.lost",
  "chargeback.partial",
  "chargeback.auto_accepted",
] as const;

export type KorapayChargebackEvent = (typeof KORAPAY_CHARGEBACK_EVENTS)[number];

export function isKorapayChargebackEvent(eventType: string): eventType is KorapayChargebackEvent {
  return (KORAPAY_CHARGEBACK_EVENTS as readonly string[]).includes(eventType);
}

function stringField(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
