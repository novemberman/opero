import {
  BadRequestException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common";
import { EmailProviderError } from "./email.errors";

/**
 * Map provider delivery failures to controlled HTTP errors.
 *
 * Recipient / validation-style rejects from the provider (4xx, REJECTED) become
 * BadRequest so clients can correct the address. Infrastructure / auth / rate
 * issues become 503 or 429 — never an unhandled 500.
 */
export function mapEmailProviderError(error: EmailProviderError): HttpException {
  if (error.code === "RATE_LIMIT") {
    return new HttpException(
      {
        message: "Email delivery is temporarily rate-limited. Try again shortly.",
        code: "EMAIL_DELIVERY_RATE_LIMITED",
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  const providerStatus = error.status;
  const recipientRejected =
    error.code === "REJECTED" ||
    (error.code === "HTTP_ERROR" &&
      providerStatus != null &&
      providerStatus >= 400 &&
      providerStatus < 500);

  if (recipientRejected) {
    return new BadRequestException({
      message: "Unable to deliver email to that address. Check the email and try again.",
      code: "EMAIL_DELIVERY_REJECTED",
    });
  }

  return new ServiceUnavailableException({
    message: "Email delivery is temporarily unavailable. Try again shortly.",
    code: "EMAIL_DELIVERY_UNAVAILABLE",
  });
}

export function isEmailProviderError(error: unknown): error is EmailProviderError {
  return error instanceof EmailProviderError;
}
