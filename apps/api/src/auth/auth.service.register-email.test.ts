import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiEnv } from "../config/env";
import { AuthService } from "./auth.service";
import { EmailProviderError } from "./email/email.errors";
import type { EmailPort } from "./email/email.port";

function configOf(values: Partial<ApiEnv>): ConfigService<ApiEnv, true> {
  return {
    get(key: keyof ApiEnv) {
      return values[key];
    },
  } as ConfigService<ApiEnv, true>;
}

describe("AuthService.register email delivery failures", () => {
  const createdUser = {
    id: "user-1",
    email: "person@example.com",
    name: "Person",
  };

  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    $executeRaw: ReturnType<typeof vi.fn>;
    user: {
      count: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    emailVerificationToken: { create: ReturnType<typeof vi.fn> };
    passwordResetToken?: {
      create: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };
  let email: { send: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      $executeRaw: vi.fn(),
      user: {
        count: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdUser),
        delete: vi.fn().mockResolvedValue(createdUser),
      },
      emailVerificationToken: {
        create: vi.fn().mockResolvedValue({ id: "tok-1" }),
      },
      $transaction: vi.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
    };
    email = { send: vi.fn() };
    audit = { record: vi.fn() };
    service = new AuthService(
      prisma as never,
      {} as never,
      email as unknown as EmailPort,
      audit as never,
      configOf({
        PUBLIC_REGISTRATION_ENABLED: true,
        PILOT_INVITE_CODE: undefined,
        PILOT_MAX_USERS: undefined,
        APP_ORIGIN: "https://opero-web-staging.up.railway.app",
        AUTH_TOKEN_TTL_HOURS: 24,
      }),
    );
  });

  it("maps provider 422 to BadRequest and rolls back the created user", async () => {
    email.send.mockRejectedValue(
      new EmailProviderError("HTTP_ERROR", "Resend responded with HTTP 422", { status: 422 }),
    );

    await expect(
      service.register({
        email: "person@example.com",
        name: "Person",
        password: "ClosureTest1!aa",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("maps provider network failures to ServiceUnavailable and rolls back", async () => {
    email.send.mockRejectedValue(new EmailProviderError("NETWORK", "Resend request failed"));

    await expect(
      service.register({
        email: "person@example.com",
        name: "Person",
        password: "ClosureTest1!aa",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  it("maps provider timeouts to ServiceUnavailable and rolls back", async () => {
    email.send.mockRejectedValue(new EmailProviderError("TIMEOUT", "Resend request timed out"));

    let caught: unknown;
    try {
      await service.register({
        email: "person@example.com",
        name: "Person",
        password: "ClosureTest1!aa",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect((caught as ServiceUnavailableException).getResponse()).toMatchObject({
      code: "EMAIL_DELIVERY_UNAVAILABLE",
    });
    expect(JSON.stringify((caught as ServiceUnavailableException).getResponse())).not.toMatch(
      /Resend|timed out|stack/i,
    );
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("keeps successful delivery path: no rollback, audit recorded, user returned", async () => {
    email.send.mockResolvedValue(undefined);

    const result = await service.register({
      email: "person@example.com",
      name: "Person",
      password: "ClosureTest1!aa",
    });

    expect(result).toEqual(createdUser);
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(email.send).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.register",
        entityId: "user-1",
        actorUserId: "user-1",
      }),
    );
  });

  it("keeps forgot-password enumeration-safe when delivery fails", async () => {
    prisma.user.findUnique = vi.fn().mockResolvedValue(createdUser);
    prisma.passwordResetToken = {
      create: vi.fn().mockResolvedValue({ id: "reset-1" }),
      delete: vi.fn().mockResolvedValue({ id: "reset-1" }),
    };
    email.send.mockRejectedValue(
      new EmailProviderError("HTTP_ERROR", "Resend responded with HTTP 422", { status: 422 }),
    );

    await expect(service.forgotPassword("person@example.com")).resolves.toBeUndefined();
    expect(prisma.passwordResetToken.delete).toHaveBeenCalledWith({ where: { id: "reset-1" } });
    expect(audit.record).not.toHaveBeenCalled();
  });
});
