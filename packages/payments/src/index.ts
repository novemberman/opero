export {
  formatNgnFromMinor,
  majorToMinorUnits,
  minorToMajorUnits,
  NGN,
  type CurrencyCode,
} from "./money/amount.js";

export type {
  InitializeCheckoutInput,
  InitializeCheckoutResult,
  ParsedWebhookEvent,
  PaymentProvider,
  PaymentProviderName,
  VerifiedCharge,
  WebhookVerificationInput,
} from "./providers/types.js";

export { KorapayProvider, type KorapayConfig } from "./providers/korapay.js";
export { MockKorapayProvider, type MockChargeState } from "./providers/mock.js";
export {
  KORAPAY_WEBHOOK_PATH,
  buildKorapayNotificationUrl,
  korapayAmountMajor,
} from "./korapay-urls.js";

import { KorapayProvider } from "./providers/korapay.js";
import { MockKorapayProvider } from "./providers/mock.js";
import type { PaymentProvider } from "./providers/types.js";

export function createPaymentProvider(input: {
  driver: "korapay" | "mock";
  secretKey?: string;
  publicKey?: string;
  baseUrl?: string;
}): PaymentProvider {
  if (input.driver === "mock") {
    return new MockKorapayProvider(input.secretKey);
  }
  if (!input.secretKey) {
    throw new Error("KORAPAY_SECRET_KEY is required when PAYMENT_PROVIDER=korapay");
  }
  return new KorapayProvider({
    secretKey: input.secretKey,
    publicKey: input.publicKey,
    baseUrl: input.baseUrl,
  });
}
