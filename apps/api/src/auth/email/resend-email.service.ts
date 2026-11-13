import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { EmailProviderError } from "./email.errors";
import { EmailPort, type EmailMessage } from "./email.port";

export const RESEND_API_BASE_URL = "https://api.resend.com";
export const RESEND_DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export type ResendFetchLike = (
  input: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export type ResendEmailServiceOptions = {
  apiKey: string;
  fromAddress: string;
  timeoutMs?: number;
  /** Injected in tests so no request ever leaves the process. */
  fetchImpl?: ResendFetchLike;
  /** Override sleep for deterministic retry tests. */
  sleep?: (ms: number) => Promise<void>;
};

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

function resolveIdempotencyKey(message: EmailMessage): string {
  if (message.idempotencyKey?.trim()) {
    return message.idempotencyKey.trim().slice(0, 256);
  }
  return createHash("sha256")
    .update(`${message.to}\n${message.subject}\n${message.text}`)
    .digest("hex");
}

function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(Math.ceil(seconds * 1000), 10_000);
    }
  }
  return Math.min(250 * 2 ** attempt, 2_000);
}

type AttemptResult =
  | { ok: true }
  | { ok: false; error: EmailProviderError; retryAfter: string | null };

/**
 * Production Resend adapter. Uses the public HTTPS Emails API.
 * Never logs API keys, tokens, or message bodies. Never reports success on rejection.
 */
@Injectable()
export class ResendEmailService extends EmailPort {
  private readonly logger = new Logger(ResendEmailService.name);
  private readonly apiKey: string;
  private readonly fromAddress: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: ResendFetchLike;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: ResendEmailServiceOptions) {
    super();
    const apiKey = options.apiKey?.trim();
    const fromAddress = options.fromAddress?.trim();
    if (!apiKey) {
      throw new EmailProviderError("CONFIG", "RESEND_API_KEY is required for MAIL_DRIVER=resend");
    }
    if (!fromAddress) {
      throw new EmailProviderError(
        "CONFIG",
        "MAIL_FROM_ADDRESS is required for MAIL_DRIVER=resend",
      );
    }
    const timeoutMs = options.timeoutMs ?? RESEND_DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new EmailProviderError("CONFIG", "MAIL_TIMEOUT_MS must be a positive number");
    }
    this.apiKey = apiKey;
    this.fromAddress = fromAddress;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async send(message: EmailMessage): Promise<void> {
    const idempotencyKey = resolveIdempotencyKey(message);
    const payload = JSON.stringify({
      from: this.fromAddress,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });

    let lastError: EmailProviderError | undefined;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const result = await this.requestOnce(payload, idempotencyKey);
      if (result.ok) {
        this.logger.log(`Resend accepted transactional email (${message.subject})`);
        return;
      }

      lastError = result.error;
      const retryable =
        result.error.code === "TIMEOUT" ||
        result.error.code === "NETWORK" ||
        (result.error.status != null && isRetryableStatus(result.error.status));
      if (!retryable || attempt >= MAX_ATTEMPTS - 1) {
        throw result.error;
      }

      this.logger.warn(
        `Resend transient failure (code=${result.error.code}, status=${result.error.status ?? "n/a"}); retrying`,
      );
      await this.sleep(backoffMs(attempt, result.retryAfter));
    }

    throw lastError ?? new EmailProviderError("REJECTED", "Resend request failed");
  }

  private async requestOnce(body: string, idempotencyKey: string): Promise<AttemptResult> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new EmailProviderError(
            "TIMEOUT",
            `Resend request timed out after ${this.timeoutMs} ms`,
          ),
        );
        controller.abort();
      }, this.timeoutMs);
    });

    try {
      const response = await Promise.race([
        this.fetchImpl(`${RESEND_API_BASE_URL}/emails`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "opero-api/1.0",
            "Idempotency-Key": idempotencyKey,
          },
          body,
          signal: controller.signal,
        }),
        timeout,
      ]);

      if (response.ok) {
        const text = await Promise.race([response.text(), timeout]);
        if (text.trim()) {
          try {
            const parsed = JSON.parse(text) as { error?: unknown };
            if (parsed.error) {
              return {
                ok: false,
                error: new EmailProviderError("REJECTED", "Resend rejected the email request", {
                  status: response.status,
                }),
                retryAfter: null,
              };
            }
          } catch {
            // Non-JSON 2xx is still acceptance for this API.
          }
        }
        return { ok: true };
      }

      const retryAfter = response.headers.get("retry-after");
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          error: new EmailProviderError("AUTH", "Resend authentication failed", {
            status: response.status,
          }),
          retryAfter: null,
        };
      }
      if (response.status === 429) {
        return {
          ok: false,
          error: new EmailProviderError("RATE_LIMIT", "Resend rate limit exceeded", {
            status: 429,
          }),
          retryAfter,
        };
      }
      return {
        ok: false,
        error: new EmailProviderError(
          "HTTP_ERROR",
          `Resend responded with HTTP ${response.status}`,
          { status: response.status },
        ),
        retryAfter: isRetryableStatus(response.status) ? retryAfter : null,
      };
    } catch (error) {
      if (error instanceof EmailProviderError) {
        return { ok: false, error, retryAfter: null };
      }
      return {
        ok: false,
        error: new EmailProviderError("NETWORK", "Resend request failed", { cause: error }),
        retryAfter: null,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
