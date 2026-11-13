import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createPaymentProvider, MockKorapayProvider } from "@opero/payments";
import type { ApiEnv } from "../config/env";
import { AuthModule } from "../auth/auth.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { CatalogService } from "./catalog.service";
import { CheckoutService } from "./checkout.service";
import { EntitlementsService } from "./entitlements.service";
import { FulfillmentService } from "./fulfillment.service";
import { PAYMENT_PROVIDER } from "./payment.tokens";
import { SubscriptionsService } from "./subscriptions.service";
import { BillingWebhooksController } from "./webhooks.controller";

export { PAYMENT_PROVIDER };

@Module({
  imports: [AuthModule],
  controllers: [BillingController, BillingWebhooksController],
  providers: [
    CatalogService,
    EntitlementsService,
    FulfillmentService,
    CheckoutService,
    SubscriptionsService,
    BillingService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnv, true>) => {
        const driver = config.get("PAYMENT_PROVIDER", { infer: true });
        if (driver === "mock") {
          return new MockKorapayProvider(
            config.get("KORAPAY_SECRET_KEY", { infer: true }) ??
              "test_korapay_secret_key_do_not_use_live",
          );
        }
        return createPaymentProvider({
          driver: "korapay",
          secretKey: config.get("KORAPAY_SECRET_KEY", { infer: true }),
          publicKey: config.get("KORAPAY_PUBLIC_KEY", { infer: true }),
          baseUrl: config.get("KORAPAY_BASE_URL", { infer: true }),
        });
      },
    },
  ],
  exports: [EntitlementsService, PAYMENT_PROVIDER, CheckoutService, FulfillmentService],
})
export class BillingModule {}
