import { describe, expect, it } from "vitest";
import { MockKorapayProvider } from "./mock.js";

describe("MockKorapayProvider", () => {
  it("initializes, settles, and verifies without network I/O", async () => {
    const provider = new MockKorapayProvider();
    const checkout = await provider.initializeCheckout({
      reference: "opero_test_1",
      amountMinor: 1_500_000,
      currency: "NGN",
      customerEmail: "buyer@example.com",
    });
    expect(checkout.checkoutUrl).toContain("opero_test_1");
    provider.settle("opero_test_1", "success");
    const verified = await provider.verifyTransaction("opero_test_1");
    expect(verified.status).toBe("success");
    expect(verified.amountMinor).toBe(1_500_000);
    expect(verified.currency).toBe("NGN");
  });

  it("rejects invalid webhook signatures", () => {
    const provider = new MockKorapayProvider();
    const { body } = provider.signWebhook({
      event: "charge.success",
      data: { reference: "r1", amount: 15000, currency: "NGN", status: "success" },
    });
    expect(
      provider.verifyWebhookSignature({
        body,
        headers: { "x-korapay-signature": "forged" },
      }),
    ).toBe(false);
  });

  it("accepts correctly signed webhooks", () => {
    const provider = new MockKorapayProvider();
    const signed = provider.signWebhook({
      event: "charge.success",
      data: { reference: "r1", amount: 15000, currency: "NGN", status: "success" },
    });
    expect(provider.verifyWebhookSignature(signed)).toBe(true);
    const parsed = provider.parseWebhookEvent(signed);
    expect(parsed.reference).toBe("r1");
    expect(parsed.amountMinor).toBe(1_500_000);
  });

  it("maps refund.success to the original payment_reference", () => {
    const provider = new MockKorapayProvider();
    const signed = provider.signWebhook({
      event: "refund.success",
      data: {
        reference: "RFD-API-001",
        payment_reference: "opero_charge_abc",
        amount: 15000,
        currency: "NGN",
        status: "success",
      },
    });
    const parsed = provider.parseWebhookEvent(signed);
    expect(parsed.eventType).toBe("refund.success");
    expect(parsed.reference).toBe("opero_charge_abc");
    expect(parsed.providerEventKey).toContain("RFD-API-001");
  });
});
