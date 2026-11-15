import { BadRequestException, HttpException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { EmailProviderError } from "./email.errors";
import { isEmailProviderError, mapEmailProviderError } from "./map-email-provider-error";

describe("mapEmailProviderError", () => {
  it("maps Resend HTTP 422 recipient rejection to BadRequest EMAIL_DELIVERY_REJECTED", () => {
    const mapped = mapEmailProviderError(
      new EmailProviderError("HTTP_ERROR", "Resend responded with HTTP 422", { status: 422 }),
    );
    expect(mapped).toBeInstanceOf(BadRequestException);
    expect(mapped.getResponse()).toMatchObject({
      code: "EMAIL_DELIVERY_REJECTED",
    });
  });

  it("maps REJECTED provider responses to BadRequest", () => {
    const mapped = mapEmailProviderError(
      new EmailProviderError("REJECTED", "Resend rejected the email request", { status: 200 }),
    );
    expect(mapped).toBeInstanceOf(BadRequestException);
    expect(mapped.getResponse()).toMatchObject({ code: "EMAIL_DELIVERY_REJECTED" });
  });

  it("maps RATE_LIMIT to 429", () => {
    const mapped = mapEmailProviderError(
      new EmailProviderError("RATE_LIMIT", "Resend rate limit exceeded", { status: 429 }),
    );
    expect(mapped).toBeInstanceOf(HttpException);
    expect(mapped.getStatus()).toBe(429);
    expect(mapped.getResponse()).toMatchObject({ code: "EMAIL_DELIVERY_RATE_LIMITED" });
  });

  it("maps NETWORK/AUTH/CONFIG and 5xx HTTP_ERROR to ServiceUnavailable", () => {
    for (const error of [
      new EmailProviderError("NETWORK", "Resend request failed"),
      new EmailProviderError("AUTH", "Resend authentication failed", { status: 401 }),
      new EmailProviderError("CONFIG", "RESEND_API_KEY is required"),
      new EmailProviderError("HTTP_ERROR", "Resend responded with HTTP 503", { status: 503 }),
      new EmailProviderError("TIMEOUT", "Resend request timed out"),
    ]) {
      const mapped = mapEmailProviderError(error);
      expect(mapped).toBeInstanceOf(ServiceUnavailableException);
      expect(mapped.getResponse()).toMatchObject({ code: "EMAIL_DELIVERY_UNAVAILABLE" });
    }
  });

  it("never exposes provider internals in client-facing messages", () => {
    const mapped = mapEmailProviderError(
      new EmailProviderError("HTTP_ERROR", "Resend responded with HTTP 422", { status: 422 }),
    );
    const payload = JSON.stringify(mapped.getResponse());
    expect(payload).not.toMatch(/Resend|stack|api[_-]?key|Bearer/i);
    expect(payload).toContain("EMAIL_DELIVERY_REJECTED");
  });

  it("identifies EmailProviderError instances", () => {
    expect(isEmailProviderError(new EmailProviderError("REJECTED", "nope"))).toBe(true);
    expect(isEmailProviderError(new Error("nope"))).toBe(false);
  });
});
