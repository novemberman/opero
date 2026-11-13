import { describe, expect, it } from "vitest";
import {
  KORAPAY_WEBHOOK_PATH,
  buildKorapayNotificationUrl,
  korapayAmountMajor,
} from "./korapay-urls.js";

describe("korapay-urls", () => {
  it("builds notification_url without secrets", () => {
    expect(KORAPAY_WEBHOOK_PATH).toBe("/billing/webhooks/korapay");
    expect(buildKorapayNotificationUrl(undefined)).toBeUndefined();
    expect(buildKorapayNotificationUrl("https://api.example.com/api/v1")).toBe(
      "https://api.example.com/api/v1/billing/webhooks/korapay",
    );
    expect(buildKorapayNotificationUrl("https://api.example.com/api/v1/")).toBe(
      "https://api.example.com/api/v1/billing/webhooks/korapay",
    );
    expect(buildKorapayNotificationUrl("https://api.example.com/api/v1")).not.toMatch(
      /sk_|secret|key=/i,
    );
  });

  it("rejects non-absolute bases", () => {
    expect(() => buildKorapayNotificationUrl("/api/v1")).toThrow(/absolute/i);
  });

  it("sends whole-naira NGN amounts as integers", () => {
    expect(korapayAmountMajor(1_500_000, "NGN")).toBe(15000);
    expect(korapayAmountMajor(2_500_000, "NGN")).toBe(25000);
    expect(Number.isInteger(korapayAmountMajor(6_500_000, "NGN"))).toBe(true);
  });
});
