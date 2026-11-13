import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "../../config/env";
import { DevEmailService } from "./dev-email.service";
import { EmailPort } from "./email.port";
import { ResendEmailService } from "./resend-email.service";

/**
 * Selects the EmailPort implementation from MAIL_DRIVER.
 * Never falls back to DevEmailService when another driver is configured.
 */
export function createEmailPort(config: ConfigService<ApiEnv, true>): EmailPort {
  const driver = config.get("MAIL_DRIVER", { infer: true });

  if (driver === "dev") {
    return new DevEmailService(config);
  }

  if (driver === "resend") {
    return new ResendEmailService({
      apiKey: config.get("RESEND_API_KEY", { infer: true }) ?? "",
      fromAddress: config.get("MAIL_FROM_ADDRESS", { infer: true }) ?? "",
      timeoutMs: config.get("MAIL_TIMEOUT_MS", { infer: true }),
    });
  }

  // SMTP is enumerated in env for clarity but no adapter ships yet.
  throw new Error(
    "MAIL_DRIVER=smtp is not supported: no SMTP adapter is configured. Use MAIL_DRIVER=resend (staging/production) or MAIL_DRIVER=dev (local).",
  );
}
