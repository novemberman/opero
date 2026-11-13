-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('ONE_TIME', 'SUBSCRIPTION', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('ONE_TIME', 'MONTHLY', 'YEARLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CheckoutPurpose" AS ENUM ('XRAY_PRO_REPORT', 'SUBSCRIPTION_START', 'SUBSCRIPTION_RENEW');

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('CREATED', 'REDIRECTED', 'PENDING_PAYMENT', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'FULFILLED', 'REFUNDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'GRACE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EntitlementScopeType" AS ENUM ('ORGANIZATION', 'REPORT');

-- CreateEnum
CREATE TYPE "EntitlementSourceType" AS ENUM ('FREE_TIER', 'PURCHASE', 'SUBSCRIPTION', 'MANUAL');

-- CreateTable
CREATE TABLE "pricing_versions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "pricing_version_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ProductKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prices" (
    "id" UUID NOT NULL,
    "pricing_version_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "pricing_version_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "price_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_entitlements" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "entitlement_code" TEXT NOT NULL,
    "limit_value" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_intents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "purpose" "CheckoutPurpose" NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'CREATED',
    "price_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "pricing_version_code" TEXT NOT NULL,
    "product_code" TEXT NOT NULL,
    "report_id" UUID,
    "plan_id" UUID,
    "subscription_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "payment_reference" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'korapay',
    "checkout_url" TEXT,
    "customer_email" TEXT NOT NULL,
    "customer_name" TEXT,
    "redirect_url" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "checkout_intent_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_reference" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amount_paid_minor" INTEGER,
    "fee_minor" INTEGER,
    "paid_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "fulfillment_lock" TEXT,
    "fulfilled_at" TIMESTAMP(3),
    "raw_verify_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "payment_id" UUID,
    "organization_id" UUID,
    "provider" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "provider_event_key" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "processed_at" TIMESTAMP(3),
    "process_result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "checkout_intent_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "price_id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "product_code" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "fulfilled_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement_grants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "scope_type" "EntitlementScopeType" NOT NULL,
    "scope_id" TEXT NOT NULL,
    "source_type" "EntitlementSourceType" NOT NULL,
    "source_id" TEXT NOT NULL,
    "limit_value" INTEGER,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "price_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "grace_until" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMP(3),
    "origin_payment_id" UUID,
    "amount_minor_snapshot" INTEGER NOT NULL,
    "currency_snapshot" CHAR(3) NOT NULL,
    "pricing_version_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_quote_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "actor_user_id" UUID,
    "contact_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_quote_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_versions_code_key" ON "pricing_versions"("code");

-- CreateIndex
CREATE INDEX "products_code_idx" ON "products"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_pricing_version_id_code_key" ON "products"("pricing_version_id", "code");

-- CreateIndex
CREATE INDEX "prices_product_id_idx" ON "prices"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "prices_pricing_version_id_code_key" ON "prices"("pricing_version_id", "code");

-- CreateIndex
CREATE INDEX "plans_code_idx" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "plans_pricing_version_id_code_key" ON "plans"("pricing_version_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "plan_entitlements_plan_id_entitlement_code_key" ON "plan_entitlements"("plan_id", "entitlement_code");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_intents_idempotency_key_key" ON "checkout_intents"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_intents_payment_reference_key" ON "checkout_intents"("payment_reference");

-- CreateIndex
CREATE INDEX "checkout_intents_organization_id_created_at_idx" ON "checkout_intents"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "checkout_intents_organization_id_report_id_idx" ON "checkout_intents"("organization_id", "report_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_checkout_intent_id_key" ON "payments"("checkout_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_fulfillment_lock_key" ON "payments"("fulfillment_lock");

-- CreateIndex
CREATE INDEX "payments_organization_id_status_idx" ON "payments"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_event_key_key" ON "payment_events"("provider_event_key");

-- CreateIndex
CREATE INDEX "payment_events_reference_idx" ON "payment_events"("reference");

-- CreateIndex
CREATE INDEX "payment_events_created_at_idx" ON "payment_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_checkout_intent_id_key" ON "purchases"("checkout_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_payment_id_key" ON "purchases"("payment_id");

-- CreateIndex
CREATE INDEX "purchases_organization_id_report_id_idx" ON "purchases"("organization_id", "report_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_organization_id_report_id_product_code_payment_id_key" ON "purchases"("organization_id", "report_id", "product_code", "payment_id");

-- CreateIndex
CREATE INDEX "entitlement_grants_organization_id_code_revoked_at_idx" ON "entitlement_grants"("organization_id", "code", "revoked_at");

-- CreateIndex
CREATE INDEX "entitlement_grants_organization_id_scope_type_scope_id_idx" ON "entitlement_grants"("organization_id", "scope_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "entitlement_grants_organization_id_code_scope_type_scope_id_key" ON "entitlement_grants"("organization_id", "code", "scope_type", "scope_id", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_origin_payment_id_key" ON "subscriptions"("origin_payment_id");

-- CreateIndex
CREATE INDEX "subscriptions_organization_id_status_idx" ON "subscriptions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "subscription_events_subscription_id_created_at_idx" ON "subscription_events"("subscription_id", "created_at");

-- CreateIndex
CREATE INDEX "enterprise_quote_requests_created_at_idx" ON "enterprise_quote_requests"("created_at");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_pricing_version_id_fkey" FOREIGN KEY ("pricing_version_id") REFERENCES "pricing_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_pricing_version_id_fkey" FOREIGN KEY ("pricing_version_id") REFERENCES "pricing_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_pricing_version_id_fkey" FOREIGN KEY ("pricing_version_id") REFERENCES "pricing_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_price_id_fkey" FOREIGN KEY ("price_id") REFERENCES "prices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_intents" ADD CONSTRAINT "checkout_intents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_intents" ADD CONSTRAINT "checkout_intents_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_intents" ADD CONSTRAINT "checkout_intents_price_id_fkey" FOREIGN KEY ("price_id") REFERENCES "prices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_checkout_intent_id_fkey" FOREIGN KEY ("checkout_intent_id") REFERENCES "checkout_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_checkout_intent_id_fkey" FOREIGN KEY ("checkout_intent_id") REFERENCES "checkout_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_price_id_fkey" FOREIGN KEY ("price_id") REFERENCES "prices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_price_id_fkey" FOREIGN KEY ("price_id") REFERENCES "prices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_origin_payment_id_fkey" FOREIGN KEY ("origin_payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_quote_requests" ADD CONSTRAINT "enterprise_quote_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_quote_requests" ADD CONSTRAINT "enterprise_quote_requests_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ai_interpretation_versions_ai_interpretation_run_id_version_num" RENAME TO "ai_interpretation_versions_ai_interpretation_run_id_version_key";

-- RenameIndex
ALTER INDEX "evidence_reconciliation_items_organization_id_reconciliation_id" RENAME TO "evidence_reconciliation_items_organization_id_reconciliatio_idx";

-- RenameIndex
ALTER INDEX "evidence_reconciliations_organization_id_conflict_key_diagnosti" RENAME TO "evidence_reconciliations_organization_id_conflict_key_diagn_key";

-- RenameIndex
ALTER INDEX "financial_metadata_reviews_organization_id_financial_statement_" RENAME TO "financial_metadata_reviews_organization_id_financial_statem_idx";

-- ---------------------------------------------------------------------------
-- Launch catalog seed (approved Phase 7A NGN prices). Amounts are kobo.
-- Historical: never mutate these rows for live purchases; add a new PricingVersion.
-- ---------------------------------------------------------------------------
INSERT INTO "pricing_versions" ("id", "code", "label", "effective_from", "notes")
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'launch.v1',
  'Nigerian launch pricing',
  TIMESTAMPTZ '2026-11-13 00:00:00+00',
  'Approved launch defaults — not permanent constants.'
);

INSERT INTO "products" ("id", "pricing_version_id", "code", "name", "description", "kind", "active", "created_at", "updated_at") VALUES
  ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111111', 'XRAY_FREE', 'Opero X-Ray Free', 'Limited diagnostic preview for authenticated organizations.', 'ONE_TIME', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111111', 'XRAY_PRO', 'Opero X-Ray Pro', 'One-time full report unlock including PDF download.', 'ONE_TIME', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111111', 'OS_STARTER', 'Opero OS Starter', 'Monthly Opero OS starter subscription.', 'SUBSCRIPTION', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('22222222-2222-4222-8222-222222222204', '11111111-1111-4111-8111-111111111111', 'OS_GROWTH', 'Opero OS Growth', 'Monthly Opero OS growth subscription.', 'SUBSCRIPTION', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('22222222-2222-4222-8222-222222222205', '11111111-1111-4111-8111-111111111111', 'ENTERPRISE', 'Opero Enterprise', 'Custom quotation — contact sales.', 'ENTERPRISE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "prices" ("id", "pricing_version_id", "product_id", "code", "currency", "amount_minor", "interval", "active", "created_at") VALUES
  ('33333333-3333-4333-8333-333333333301', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222201', 'XRAY_FREE.NGN', 'NGN', 0, 'ONE_TIME', true, CURRENT_TIMESTAMP),
  ('33333333-3333-4333-8333-333333333302', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222202', 'XRAY_PRO.NGN', 'NGN', 1500000, 'ONE_TIME', true, CURRENT_TIMESTAMP),
  ('33333333-3333-4333-8333-333333333303', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222203', 'OS_STARTER.NGN.MONTHLY', 'NGN', 2500000, 'MONTHLY', true, CURRENT_TIMESTAMP),
  ('33333333-3333-4333-8333-333333333304', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222204', 'OS_GROWTH.NGN.MONTHLY', 'NGN', 6500000, 'MONTHLY', true, CURRENT_TIMESTAMP),
  ('33333333-3333-4333-8333-333333333305', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222205', 'ENTERPRISE.CUSTOM', 'NGN', 0, 'CUSTOM', true, CURRENT_TIMESTAMP);

INSERT INTO "plans" ("id", "pricing_version_id", "product_id", "price_id", "code", "name", "description", "active", "created_at") VALUES
  ('44444444-4444-4444-8444-444444444401', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', 'XRAY_FREE', 'X-Ray Free', 'Implicit free tier for authenticated organizations.', true, CURRENT_TIMESTAMP),
  ('44444444-4444-4444-8444-444444444402', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222203', '33333333-3333-4333-8333-333333333303', 'OS_STARTER', 'OS Starter', 'Starter monthly plan.', true, CURRENT_TIMESTAMP),
  ('44444444-4444-4444-8444-444444444403', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222204', '33333333-3333-4333-8333-333333333304', 'OS_GROWTH', 'OS Growth', 'Growth monthly plan.', true, CURRENT_TIMESTAMP);

INSERT INTO "plan_entitlements" ("id", "plan_id", "entitlement_code", "limit_value", "metadata") VALUES
  ('55555555-5555-4555-8555-555555555501', '44444444-4444-4444-8444-444444444401', 'xray.preview', NULL, '{"notes":"documents, readiness, limited KPI preview"}'::jsonb),
  ('55555555-5555-4555-8555-555555555502', '44444444-4444-4444-8444-444444444402', 'xray.preview', NULL, NULL),
  ('55555555-5555-4555-8555-555555555503', '44444444-4444-4444-8444-444444444402', 'xray.full_report', NULL, '{"scope":"organization"}'::jsonb),
  ('55555555-5555-4555-8555-555555555504', '44444444-4444-4444-8444-444444444402', 'xray.pdf_download', NULL, '{"scope":"organization"}'::jsonb),
  ('55555555-5555-4555-8555-555555555505', '44444444-4444-4444-8444-444444444402', 'os.seats', 5, NULL),
  ('55555555-5555-4555-8555-555555555506', '44444444-4444-4444-8444-444444444402', 'os.monitoring', 1, '{"per_day":1}'::jsonb),
  ('55555555-5555-4555-8555-555555555507', '44444444-4444-4444-8444-444444444403', 'xray.preview', NULL, NULL),
  ('55555555-5555-4555-8555-555555555508', '44444444-4444-4444-8444-444444444403', 'xray.full_report', NULL, '{"scope":"organization"}'::jsonb),
  ('55555555-5555-4555-8555-555555555509', '44444444-4444-4444-8444-444444444403', 'xray.pdf_download', NULL, '{"scope":"organization"}'::jsonb),
  ('55555555-5555-4555-8555-55555555550a', '44444444-4444-4444-8444-444444444403', 'os.seats', 25, NULL),
  ('55555555-5555-4555-8555-55555555550b', '44444444-4444-4444-8444-444444444403', 'os.monitoring', 24, '{"per_day":24}'::jsonb);
