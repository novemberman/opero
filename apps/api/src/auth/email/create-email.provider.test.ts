import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import type { ApiEnv } from "../../config/env";
import { createEmailPort } from "./create-email.provider";
import { DevEmailService } from "./dev-email.service";
import { ResendEmailService } from "./resend-email.service";

function configOf(values: Partial<ApiEnv>): ConfigService<ApiEnv, true> {
  return {
    get(key: keyof ApiEnv) {
      return values[key];
    },
  } as ConfigService<ApiEnv, true>;
}

describe("createEmailPort", () => {
  it("selects DevEmailService for MAIL_DRIVER=dev", () => {
    const port = createEmailPort(
      configOf({
        MAIL_DRIVER: "dev",
        MAIL_DIR: ".data/mail-test",
      }),
    );
    expect(port).toBeInstanceOf(DevEmailService);
  });

  it("selects ResendEmailService for MAIL_DRIVER=resend", () => {
    const port = createEmailPort(
      configOf({
        MAIL_DRIVER: "resend",
        RESEND_API_KEY: "re_test_key_for_selection",
        MAIL_FROM_ADDRESS: "Opero <noreply@opero.test>",
        MAIL_TIMEOUT_MS: 15_000,
      }),
    );
    expect(port).toBeInstanceOf(ResendEmailService);
  });

  it("rejects MAIL_DRIVER=smtp instead of falling back to DevEmailService", () => {
    expect(() =>
      createEmailPort(
        configOf({
          MAIL_DRIVER: "smtp",
          SMTP_URL: "smtps://user:pass@smtp.example.com:465",
        }),
      ),
    ).toThrow(/MAIL_DRIVER=smtp is not supported/);
  });

  it("does not fall back to DevEmailService when Resend config is incomplete", () => {
    expect(() =>
      createEmailPort(
        configOf({
          MAIL_DRIVER: "resend",
          RESEND_API_KEY: "",
          MAIL_FROM_ADDRESS: "",
        }),
      ),
    ).toThrow(/RESEND_API_KEY|MAIL_FROM_ADDRESS/);
  });
});
