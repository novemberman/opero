export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain-text body (required for accessibility and providers that prefer text). */
  text: string;
  /** Optional HTML alternative; Resend sends both when present. */
  html?: string;
  /**
   * Optional provider idempotency key. When set, safe retries of the same
   * message must not create duplicate deliveries.
   */
  idempotencyKey?: string;
};

export abstract class EmailPort {
  abstract send(message: EmailMessage): Promise<void>;
}
