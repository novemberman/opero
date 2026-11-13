export type PaymentProviderName = "korapay" | "mock";

export type InitializeCheckoutInput = {
  reference: string;
  amountMinor: number;
  currency: string;
  customerEmail: string;
  customerName?: string | null;
  redirectUrl?: string | null;
  notificationUrl?: string | null;
  narration?: string | null;
  metadata?: Record<string, string | number | boolean>;
};

export type InitializeCheckoutResult = {
  provider: PaymentProviderName;
  reference: string;
  checkoutUrl: string;
  raw?: unknown;
};

export type VerifiedCharge = {
  provider: PaymentProviderName;
  reference: string;
  status: "success" | "failed" | "pending" | "abandoned";
  amountMinor: number;
  currency: string;
  feeMinor?: number | null;
  providerReference?: string | null;
  paidAt?: string | null;
  raw: unknown;
};

export type WebhookVerificationInput = {
  /** Raw JSON body string when available; otherwise reconstructed from parsed body. */
  rawBody?: string | null;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
};

export type ParsedWebhookEvent = {
  provider: PaymentProviderName;
  eventType: string;
  reference: string;
  status: "success" | "failed" | "pending" | "unknown";
  amountMinor?: number | null;
  currency?: string | null;
  /** Stable dedupe key — never trust client-supplied ids alone. */
  providerEventKey: string;
  payload: unknown;
};

/**
 * Provider-neutral payment port.
 *
 * Korapay checkout, verify, webhooks and refunds are implemented.
 * Native recurring subscription charges are NOT wired in Phase 7A —
 * subscription renewals use explicitly authorized one-time checkouts.
 */
export interface PaymentProvider {
  readonly name: PaymentProviderName;
  initializeCheckout(input: InitializeCheckoutInput): Promise<InitializeCheckoutResult>;
  verifyTransaction(reference: string): Promise<VerifiedCharge>;
  verifyWebhookSignature(input: WebhookVerificationInput): boolean;
  parseWebhookEvent(input: WebhookVerificationInput): ParsedWebhookEvent;
}
