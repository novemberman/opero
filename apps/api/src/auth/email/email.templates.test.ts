import { describe, expect, it } from "vitest";
import { buildPasswordResetEmail, buildVerificationEmail } from "./email.templates";

describe("email templates", () => {
  it("builds branded verification mail with expiration and plain-text + html", () => {
    const message = buildVerificationEmail({
      to: "user@example.com",
      appOrigin: "https://app.example",
      token: "verify-token-value",
      ttlHours: 24,
    });

    expect(message.to).toBe("user@example.com");
    expect(message.subject).toBe("Verify your Opero email");
    expect(message.text).toContain("https://app.example/verify-email?token=verify-token-value");
    expect(message.text).toContain("expires in 24 hours");
    expect(message.text).toContain("Opero");
    expect(message.html).toContain("Opero");
    expect(message.html).toContain("Verify email");
    expect(message.html).toContain("https://app.example/verify-email?token=verify-token-value");
    expect(message.html).not.toContain("<script");
    expect(message.idempotencyKey).toBe("email-verify/verify-token-value");
  });

  it("builds branded password-reset mail with expiration", () => {
    const message = buildPasswordResetEmail({
      to: "user@example.com",
      appOrigin: "https://app.example",
      token: "reset-token-value",
      ttlHours: 1,
    });

    expect(message.subject).toBe("Reset your Opero password");
    expect(message.text).toContain("https://app.example/reset-password?token=reset-token-value");
    expect(message.text).toContain("expires in 1 hour");
    expect(message.html).toContain("Reset password");
    expect(message.idempotencyKey).toBe("password-reset/reset-token-value");
  });
});
