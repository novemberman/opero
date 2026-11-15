-- PR-2L-A: chargeback / dispute payment statuses for entitlement suspension & revoke.
-- Documented Korapay events: chargeback.pending|declined|lost|partial|auto_accepted

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'DISPUTED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CHARGEBACK';

ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'DISPUTED';

-- Durable manual dispute actions (finance/admin). Not a payment bypass.
CREATE TABLE "payment_dispute_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence_note" TEXT,
    "provider_chargeback_ref" TEXT,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_dispute_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_dispute_actions_payment_id_created_at_idx"
  ON "payment_dispute_actions"("payment_id", "created_at");
CREATE INDEX "payment_dispute_actions_organization_id_created_at_idx"
  ON "payment_dispute_actions"("organization_id", "created_at");

ALTER TABLE "payment_dispute_actions"
  ADD CONSTRAINT "payment_dispute_actions_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_dispute_actions"
  ADD CONSTRAINT "payment_dispute_actions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_dispute_actions"
  ADD CONSTRAINT "payment_dispute_actions_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
