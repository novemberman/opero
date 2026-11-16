/**
 * Checkout initialization failure classification.
 *
 * - definite: provider clearly rejected the attempt — safe to release a local reservation
 * - ambiguous: timeout / network / 5xx / unknown — do NOT release; may have charged
 */
export type PaymentInitFailureKind = "definite" | "ambiguous";

export class PaymentInitError extends Error {
  readonly kind: PaymentInitFailureKind;

  constructor(message: string, kind: PaymentInitFailureKind, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "PaymentInitError";
    this.kind = kind;
  }
}

export function isPaymentInitError(error: unknown): error is PaymentInitError {
  return error instanceof PaymentInitError;
}

export function isAmbiguousPaymentInitError(error: unknown): boolean {
  if (error instanceof PaymentInitError) return error.kind === "ambiguous";
  // Untyped network-ish failures default to ambiguous (fail closed on release).
  if (!(error instanceof Error)) return true;
  return /timeout|etimedout|econnreset|econnrefused|enotfound|fetch failed|network|aborted|socket/i.test(
    error.message,
  );
}
