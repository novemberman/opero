import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { CheckoutService } from "./checkout.service";

function serviceWithOrigin(origin: string) {
  const config = {
    get: vi.fn((key: string) => {
      if (key === "APP_ORIGIN") return origin;
      if (key === "BILLING_WEBHOOK_BASE_URL") return undefined;
      if (key === "EMERGENCY_DISABLE_CHECKOUT") return false;
      if (key === "LIVE_PILOT_ENABLED") return false;
      return undefined;
    }),
  };
  return new CheckoutService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    config as never,
    {} as never,
  );
}

describe("CheckoutService redirect URL resolution", () => {
  it("defaults to /billing/return on APP_ORIGIN", () => {
    const svc = serviceWithOrigin("https://opero.example");
    expect(svc.defaultRedirectUrl()).toBe("https://opero.example/billing/return");
    expect(svc.resolveRedirectUrl(undefined)).toBe("https://opero.example/billing/return");
    expect(svc.resolveRedirectUrl(null)).toBe("https://opero.example/billing/return");
  });

  it("allows same-origin custom paths", () => {
    const svc = serviceWithOrigin("https://opero.example");
    expect(
      svc.resolveRedirectUrl("https://opero.example/organizations/x/billing?reportId=y"),
    ).toBe("https://opero.example/organizations/x/billing?reportId=y");
  });

  it("rejects foreign origins", () => {
    const svc = serviceWithOrigin("https://opero.example");
    expect(() => svc.resolveRedirectUrl("https://evil.example/phish")).toThrow(BadRequestException);
  });
});
