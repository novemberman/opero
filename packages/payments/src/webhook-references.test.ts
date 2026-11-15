import { describe, expect, it } from "vitest";
import {
  extractKorapayChargebackReference,
  extractKorapayWebhookPaymentReference,
  isKorapayChargebackEvent,
} from "./webhook-references.js";

describe("Korapay webhook payment reference extraction", () => {
  it("uses data.reference for charge events", () => {
    expect(
      extractKorapayWebhookPaymentReference("charge.success", {
        reference: "opero_charge_1",
        payment_reference: "other",
      }),
    ).toBe("opero_charge_1");
  });

  it("uses payment_reference for refund events", () => {
    expect(
      extractKorapayWebhookPaymentReference("refund.success", {
        reference: "RFD-001",
        payment_reference: "opero_charge_1",
      }),
    ).toBe("opero_charge_1");
  });

  it("uses nested payment.reference for documented chargeback payloads", () => {
    expect(
      extractKorapayWebhookPaymentReference("chargeback.pending", {
        reference: "KPY-CHG-xYvpQYHw7wYIfzs",
        payment: {
          status: "success",
          reference: "opero_af4def5d681d4d41bfed4b95667bf5b0",
        },
        chargeback_amount: 300,
        currency: "NGN",
        status: "pending",
      }),
    ).toBe("opero_af4def5d681d4d41bfed4b95667bf5b0");
  });

  it("falls back to payment_reference for chargeback list-style payloads", () => {
    expect(
      extractKorapayWebhookPaymentReference("chargeback.lost", {
        reference: "KPY-CHG-9w905W7QY2A9jzw",
        payment_reference: "opero_charge_2",
        status: "lost",
      }),
    ).toBe("opero_charge_2");
  });

  it("does not treat chargeback id as the payment reference", () => {
    expect(
      extractKorapayWebhookPaymentReference("chargeback.auto_accepted", {
        reference: "KPY-CHG-only",
        status: "accepted",
      }),
    ).toBe("");
  });

  it("extracts chargeback id for dedupe metadata", () => {
    expect(
      extractKorapayChargebackReference({ reference: "KPY-CHG-abc", payment: { reference: "p" } }),
    ).toBe("KPY-CHG-abc");
  });

  it("recognizes only documented chargeback event names", () => {
    expect(isKorapayChargebackEvent("chargeback.won")).toBe(false);
    expect(isKorapayChargebackEvent("chargeback.pending")).toBe(true);
    expect(isKorapayChargebackEvent("chargeback.lost")).toBe(true);
  });
});
