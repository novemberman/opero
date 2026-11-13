import { createHmac, timingSafeEqual } from "node:crypto";
import { korapayAmountMajor } from "../korapay-urls.js";
import { majorToMinorUnits } from "../money/amount.js";
import type {
  InitializeCheckoutInput,
  InitializeCheckoutResult,
  ParsedWebhookEvent,
  PaymentProvider,
  VerifiedCharge,
  WebhookVerificationInput,
} from "./types.js";

export type KorapayConfig = {
  secretKey: string;
  publicKey?: string;
  baseUrl?: string;
  /** Injected for tests — never log the secret. */
  fetchImpl?: typeof fetch;
};

const DEFAULT_BASE = "https://api.korapay.com";

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(direct)) return direct[0];
  return direct;
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "utf8");
    const right = Buffer.from(b, "utf8");
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

/**
 * Korapay adapter (primary Nigerian provider).
 *
 * Official docs used:
 * - POST /merchant/api/v1/charges/initialize
 * - GET  /merchant/api/v1/charges/:reference
 * - Webhook HMAC-SHA256 of JSON.stringify(data) via x-korapay-signature
 * - Refunds API exists; recurring uses Direct Debit authorizations (not auto-wired here)
 *
 * Amounts: Korapay uses major units (naira). Opero converts from kobo.
 */
export class KorapayProvider implements PaymentProvider {
  readonly name = "korapay" as const;
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: KorapayConfig) {
    if (!config.secretKey || config.secretKey.length < 8) {
      throw new Error("Korapay secret key is required");
    }
    this.secretKey = config.secretKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async initializeCheckout(input: InitializeCheckoutInput): Promise<InitializeCheckoutResult> {
    // Official Checkout Redirect: amount in major units; Bearer secret key.
    const amountMajor = korapayAmountMajor(input.amountMinor, input.currency);
    const body: Record<string, unknown> = {
      amount: amountMajor,
      currency: input.currency.toUpperCase(),
      reference: input.reference,
      customer: {
        email: input.customerEmail,
        ...(input.customerName ? { name: input.customerName } : {}),
      },
      ...(input.redirectUrl ? { redirect_url: input.redirectUrl } : {}),
      ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
      ...(input.narration ? { narration: input.narration } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };

    const response = await this.fetchImpl(`${this.baseUrl}/merchant/api/v1/charges/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: { reference?: string; checkout_url?: string };
    };
    if (!response.ok || !json.status || !json.data?.checkout_url || !json.data.reference) {
      throw new Error(json.message ?? "Korapay checkout initialization failed");
    }
    return {
      provider: "korapay",
      reference: json.data.reference,
      checkoutUrl: json.data.checkout_url,
      raw: json,
    };
  }

  async verifyTransaction(reference: string): Promise<VerifiedCharge> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/merchant/api/v1/charges/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${this.secretKey}` },
      },
    );
    const json = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        reference?: string;
        status?: string;
        amount?: string | number;
        amount_paid?: string | number;
        fee?: string | number;
        currency?: string;
      };
    };
    if (!response.ok || !json.status || !json.data) {
      throw new Error(json.message ?? "Korapay verification failed");
    }
    const currency = (json.data.currency ?? "NGN").toUpperCase();
    const amountMajor = Number(json.data.amount_paid ?? json.data.amount ?? 0);
    const feeMajor = json.data.fee != null ? Number(json.data.fee) : null;
    const statusRaw = (json.data.status ?? "pending").toLowerCase();
    const status: VerifiedCharge["status"] =
      statusRaw === "success"
        ? "success"
        : statusRaw === "failed"
          ? "failed"
          : statusRaw === "abandoned"
            ? "abandoned"
            : "pending";
    return {
      provider: "korapay",
      reference: json.data.reference ?? reference,
      status,
      amountMinor: majorToMinorUnits(amountMajor, currency),
      currency,
      feeMinor: feeMajor == null ? null : majorToMinorUnits(feeMajor, currency),
      providerReference: json.data.reference ?? reference,
      raw: json,
    };
  }

  verifyWebhookSignature(input: WebhookVerificationInput): boolean {
    const signature = headerValue(input.headers, "x-korapay-signature");
    if (!signature) return false;
    const data = extractDataObject(input.body);
    if (data === undefined) return false;
    const hash = createHmac("sha256", this.secretKey)
      .update(JSON.stringify(data))
      .digest("hex");
    return safeEqualHex(hash, signature);
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
    // Refund payloads use `reference` for the refund id and `payment_reference`
    // for the original charge — fulfill/revoke against the payment reference.
    const isRefund = eventType.startsWith("refund.");
    const reference = isRefund
      ? (body.data?.payment_reference ?? body.data?.reference ?? "")
      : (body.data?.reference ?? body.data?.payment_reference ?? "");
    const currency = body.data?.currency ? String(body.data.currency).toUpperCase() : null;
    const amountMinor =
      body.data?.amount != null && currency
        ? majorToMinorUnits(Number(body.data.amount), currency)
        : null;
    const statusRaw = (body.data?.status ?? "").toLowerCase();
    const status: ParsedWebhookEvent["status"] =
      statusRaw === "success"
        ? "success"
        : statusRaw === "failed"
          ? "failed"
          : statusRaw === "pending"
            ? "pending"
            : "unknown";
    const dedupeRef =
      body.data?.reference ?? body.data?.payment_reference ?? (reference || "unknown");
    return {
      provider: "korapay",
      eventType,
      reference,
      status,
      amountMinor,
      currency,
      providerEventKey: `korapay:${eventType}:${dedupeRef}:${statusRaw || "na"}`,
      payload: body,
    };
  }
}

function extractDataObject(body: unknown): unknown {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: unknown }).data;
  }
  return undefined;
}
