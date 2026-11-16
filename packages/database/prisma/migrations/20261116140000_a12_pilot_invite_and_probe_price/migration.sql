-- A12-P1: Pilot bootstrap invitations (ops-issued, single-use, hashed tokens)
CREATE TABLE "pilot_bootstrap_invitations" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "organization_name" TEXT NOT NULL,
    "organization_slug" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by_label" TEXT NOT NULL,
    "consumed_user_id" UUID,
    "consumed_organization_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pilot_bootstrap_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pilot_bootstrap_invitations_token_hash_key" ON "pilot_bootstrap_invitations"("token_hash");
CREATE INDEX "pilot_bootstrap_invitations_email_idx" ON "pilot_bootstrap_invitations"("email");
CREATE INDEX "pilot_bootstrap_invitations_expires_at_idx" ON "pilot_bootstrap_invitations"("expires_at");

ALTER TABLE "pilot_bootstrap_invitations" ADD CONSTRAINT "pilot_bootstrap_invitations_consumed_user_id_fkey" FOREIGN KEY ("consumed_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pilot_bootstrap_invitations" ADD CONSTRAINT "pilot_bootstrap_invitations_consumed_organization_id_fkey" FOREIGN KEY ("consumed_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A12-P2: Hidden ₦100 live-pilot probe product/price (excluded from public catalog in app code).
-- Do not mutate XRAY_PRO.NGN (₦15,000).
INSERT INTO "products" ("id", "pricing_version_id", "code", "name", "description", "kind", "active", "created_at", "updated_at")
VALUES (
  '22222222-2222-4222-8222-222222222206',
  '11111111-1111-4111-8111-111111111111',
  'XRAY_PRO_LIVE_PROBE',
  'Opero X-Ray Pro Live Pilot Probe',
  'Internal ₦100 live-payment pilot only — not listed in public catalog.',
  'ONE_TIME',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO "prices" ("id", "pricing_version_id", "product_id", "code", "currency", "amount_minor", "interval", "active", "created_at")
VALUES (
  '33333333-3333-4333-8333-333333333306',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222206',
  'XRAY_PRO_LIVE_PROBE.NGN',
  'NGN',
  10000,
  'ONE_TIME',
  true,
  CURRENT_TIMESTAMP
);
