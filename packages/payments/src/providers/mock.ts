import { createHmac } from "node:crypto";
import { majorToMinorUnits, minorToMajorUnits } from "../money/amount.js";
import type {
  InitializeCheckoutInput,
  InitializeCheckoutResult,
  ParsedWebhookEvent,
  PaymentProvider,
  VerifiedCharge,
  WebhookVerificationInput,
} from "./types.js";

export type MockChargeState = {
  reference: string;
  amountMinor: number;
  currency: string;
  status: "success" | "failed" | "pending" | "abandoned";
  feeMinor?: number;
};

/**
 * Deterministic in-memory Korapay-compatible provider for local dev and tests.
 * Never contacts the network. Secret is only used for HMAC webhook tests.
 */
export class MockKorapayProvider implements PaymentProvider {
  readonly name = "mock" as const;
  private readonly secretKey: string;
  private readonly charges = new Map<string, MockChargeState>();

  constructor(secretKey = "test_korapay_secret_key_do_not_use_live") {
    this.secretKey = secretKey;
  }

  /** Test helper: mark a previously initialized charge as paid/failed. */
  settle(reference: string, status: MockChargeState["status"] = "success"): void {
    const existing = this.charges.get(reference);
    if (!existing) throw new Error(`Unknown mock charge ${reference}`);
    existing.status = status;
  }

  /** Test helper: forge a signed webhook body like Korapay. */
  signWebhook(body: { event: string; data: Record<string, unknown> }): {
    body: typeof body;
    headers: Record<string, string>;
  } {
    const signature = createHmac("sha256", this.secretKey)
      .update(JSON.stringify(body.data))
      .digest("hex");
    return { body, headers: { "x-korapay-signature": signature } };
  }

  getSecretForTests(): string {
    return this.secretKey;
  }

  async initializeCheckout(input: InitializeCheckoutInput): Promise<InitializeCheckoutResult> {
    this.charges.set(input.reference, {
      reference: input.reference,
      amountMinor: input.amountMinor,
      currency: input.currency.toUpperCase(),
      status: "pending",
      feeMinor: 0,
    });
    return {
      provider: "mock",
      reference: input.reference,
      checkoutUrl: `https://checkout.mock.korapay.local/pay/${encodeURIComponent(input.reference)}`,
    };
  }

  async verifyTransaction(reference: string): Promise<VerifiedCharge> {
    const charge = this.charges.get(reference);
    if (!charge) {
      throw new Error("Mock charge not found");
    }
    return {
      provider: "mock",
      reference: charge.reference,
      status: charge.status,
      amountMinor: charge.amountMinor,
      currency: charge.currency,
      feeMinor: charge.feeMinor ?? 0,
      providerReference: charge.reference,
      raw: {
        status: true,
        data: {
          reference: charge.reference,
          status: charge.status,
          amount: String(minorToMajorUnits(charge.amountMinor, charge.currency)),
          amount_paid: String(minorToMajorUnits(charge.amountMinor, charge.currency)),
          fee: String(minorToMajorUnits(charge.feeMinor ?? 0, charge.currency)),
          currency: charge.currency,
        },
      },
    };
  }

  verifyWebhookSignature(input: WebhookVerificationInput): boolean {
    const signatureHeader = input.headers["x-korapay-signature"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!signature) return false;
    const data =
      input.body && typeof input.body === "object" && "data" in input.body
        ? (input.body as { data: unknown }).data
        : undefined;
    if (data === undefined) return false;
    const hash = createHmac("sha256", this.secretKey)
      .update(JSON.stringify(data))
      .digest("hex");
    return hash === signature;
  }

  parseWebhookEvent(input: WebhookVerificationInput): ParsedWebhookEvent {
    const body = input.body as {
      event?: string;
      data?: {
        reference?: string;
        payment_reference?: string;
        status?: string;
        amount?: number | string;
        currency?: string;
      };
    };
    const eventType = body.event ?? "unknown";
    const isRefund = eventType.startsWith("refund.");
    const reference = isRefund
      ? (body.data?.payment_reference ?? body.data?.reference ?? "")
      : (body.data?.reference ?? body.data?.payment_reference ?? "");
    const currency = body.data?.currency ? String(body.data.currency).toUpperCase() : "NGN";
    const amountMinor =
      body.data?.amount != null
        ? majorToMinorUnits(Number(body.data.amount), currency)
        : null;
    const statusRaw = (body.data?.status ?? "").toLowerCase();
    const dedupeRef =
      body.data?.reference ?? body.data?.payment_reference ?? (reference || "unknown");
    return {
      provider: "mock",
      eventType,
      reference,
      status:
        statusRaw === "success"
          ? "success"
          : statusRaw === "failed"
            ? "failed"
            : statusRaw === "pending"
              ? "pending"
              : "unknown",
      amountMinor,
      currency,
      providerEventKey: `mock:${eventType}:${dedupeRef}:${statusRaw || "na"}`,
      payload: body,
    };
  }
}
