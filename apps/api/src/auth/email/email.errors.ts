export type EmailProviderErrorCode =
  | "CONFIG"
  | "AUTH"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "NETWORK"
  | "REJECTED";

export class EmailProviderError extends Error {
  readonly code: EmailProviderErrorCode;
  readonly status?: number;

  constructor(
    code: EmailProviderErrorCode,
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "EmailProviderError";
    this.code = code;
    this.status = options?.status;
  }
}
