import { NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockKorapayProvider } from "@opero/payments";
import { CheckoutService } from "./checkout.service";

describe("CheckoutService.mockSettleAndFulfill", () => {
  const actor = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.com",
    name: "Owner",
  };

  let payments: MockKorapayProvider;
  let prisma: {
    payment: { findFirst: ReturnType<typeof vi.fn> };
  };
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: CheckoutService;

  beforeEach(() => {
    payments = new MockKorapayProvider();
    prisma = {
      payment: { findFirst: vi.fn() },
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    const config = {
      get: vi.fn((key: string) => {
        if (key === "APP_ORIGIN") return "https://opero-web-staging.up.railway.app";
        if (key === "BILLING_WEBHOOK_BASE_URL") return undefined;
        return undefined;
      }),
    } as unknown as ConfigService<never, true>;
    service = new CheckoutService(
      prisma as never,
      {} as never,
      {} as never,
      audit as never,
      config,
      payments,
    );
  });

  it("returns NotFound when the live provider is not mock", async () => {
    const nonMock = {
      name: "korapay" as const,
      initializeCheckout: vi.fn(),
      verifyTransaction: vi.fn(),
      verifyWebhookSignature: vi.fn(),
      parseWebhookEvent: vi.fn(),
    };
    const config = {
      get: vi.fn(() => "https://app.example.com"),
    } as unknown as ConfigService<never, true>;
    const korapayService = new CheckoutService(
      prisma as never,
      {} as never,
      {} as never,
      audit as never,
      config,
      nonMock,
    );
    await expect(
      korapayService.mockSettleAndFulfill({
        organizationId: "22222222-2222-4222-8222-222222222222",
        reference: "opero_abc",
        outcome: "success",
        actor: actor as never,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects unknown mock charges without fulfilling", async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      reference: "opero_missing",
      organizationId: "22222222-2222-4222-8222-222222222222",
      checkoutIntent: { purpose: "XRAY_PRO_REPORT", reportId: "44444444-4444-4444-8444-444444444444" },
    });
    await expect(
      service.mockSettleAndFulfill({
        organizationId: "22222222-2222-4222-8222-222222222222",
        reference: "opero_missing",
        outcome: "success",
        actor: actor as never,
      }),
    ).rejects.toMatchObject({ response: { code: "MOCK_CHARGE_UNKNOWN" } });
    expect(audit.record).not.toHaveBeenCalled();
  });
});
