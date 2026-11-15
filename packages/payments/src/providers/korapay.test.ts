import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { KorapayProvider } from "./korapay.js";

function signedWebhook(
  secret: string,
  body: { event: string; data: Record<string, unknown> },
): { body: typeof body; headers: Record<string, string> } {
  const signature = createHmac("sha256", secret)
    .update(JSON.stringify(body.data))
    .digest("hex");
  return { body, headers: { "x-korapay-signature": signature } };
}

describe("KorapayProvider", () => {
  const secret = "sk_test_unit_secret_key_for_tests";

  it("initializes checkout with major-unit amount and Bearer auth", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        status: true,
        data: {
          reference: "opero_ref_1",
          checkout_url: "https://checkout.korapay.com/pay/opero_ref_1",
        },
      }),
    );
    const provider = new KorapayProvider({ secretKey: secret, fetchImpl: fetchImpl as typeof fetch });
    const result = await provider.initializeCheckout({
      reference: "opero_ref_1",
      amountMinor: 1_500_000,
      currency: "NGN",
      customerEmail: "buyer@example.com",
      notificationUrl: "https://opero-staging.up.railway.app/api/v1/billing/webhooks/korapay",
    });
    expect(result.checkoutUrl).toContain("checkout.korapay.com");
    const init = fetchImpl.mock.calls[0];
    expect(String(init?.[0])).toContain("/merchant/api/v1/charges/initialize");
    expect((init?.[1] as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${secret}`,
    });
    const body = JSON.parse(String((init?.[1] as RequestInit).body));
    expect(body.amount).toBe(15000);
    expect(body.currency).toBe("NGN");
    expect(body.notification_url).toContain("/billing/webhooks/korapay");
  });

  it("verifies charges and maps pending/success/failed statuses", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        status: true,
        data: {
          reference: "opero_ref_2",
          status: "pending",
          amount: 15000,
          currency: "NGN",
        },
      }),
    );
    const provider = new KorapayProvider({ secretKey: secret, fetchImpl: fetchImpl as typeof fetch });
    const pending = await provider.verifyTransaction("opero_ref_2");
    expect(pending.status).toBe("pending");
    expect(pending.amountMinor).toBe(1_500_000);

    fetchImpl.mockResolvedValueOnce(
      Response.json({
        status: true,
        data: {
          reference: "opero_ref_2",
          status: "success",
          amount_paid: 15000,
          currency: "NGN",
          fee: 100,
        },
      }),
    );
    const ok = await provider.verifyTransaction("opero_ref_2");
    expect(ok.status).toBe("success");
    expect(ok.feeMinor).toBe(10_000);
  });

  it("accepts documented HMAC of data object and rejects forged signatures", () => {
    const provider = new KorapayProvider({ secretKey: secret });
    const signed = signedWebhook(secret, {
      event: "charge.success",
      data: {
        reference: "opero_ref_3",
        amount: 15000,
        currency: "NGN",
        status: "success",
      },
    });
    expect(provider.verifyWebhookSignature(signed)).toBe(true);
    expect(
      provider.verifyWebhookSignature({
        body: signed.body,
        headers: { "x-korapay-signature": "deadbeef" },
      }),
    ).toBe(false);
  });

  it("maps refund.success to payment_reference for entitlement revoke", () => {
    const provider = new KorapayProvider({ secretKey: secret });
    const signed = signedWebhook(secret, {
      event: "refund.success",
      data: {
        reference: "RFD-001",
        payment_reference: "opero_charge_abc",
        amount: 15000,
        currency: "NGN",
        status: "success",
      },
    });
    expect(provider.verifyWebhookSignature(signed)).toBe(true);
    const parsed = provider.parseWebhookEvent(signed);
    expect(parsed.eventType).toBe("refund.success");
    expect(parsed.reference).toBe("opero_charge_abc");
  });

  it("sends the secret only as Bearer auth, never in JSON bodies or query strings", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo) => {
      if (String(url).includes("/charges/initialize")) {
        return Response.json({
          status: true,
          data: { reference: "r", checkout_url: "https://checkout.example/r" },
        });
      }
      return Response.json({
        status: true,
        data: { reference: "r", status: "failed", amount: 1, currency: "NGN" },
      });
    });
    const provider = new KorapayProvider({ secretKey: secret, fetchImpl: fetchImpl as typeof fetch });
    await provider.initializeCheckout({
      reference: "r",
      amountMinor: 100,
      currency: "NGN",
      customerEmail: "a@b.c",
    });
    await provider.verifyTransaction("r");
    for (const call of fetchImpl.mock.calls) {
      const url = String(call[0]);
      const init = call[1] as RequestInit | undefined;
      expect(url).not.toContain(secret);
      expect(String(init?.body ?? "")).not.toContain(secret);
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${secret}`);
    }
  });
});
