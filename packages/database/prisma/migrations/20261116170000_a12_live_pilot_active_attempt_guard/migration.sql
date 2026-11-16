-- A12-P3-R2: at most one active live-pilot checkout attempt per org/report.
-- Additive only. Does not alter XRAY_PRO pricing or existing payment rows.
-- Active = CREATED | REDIRECTED | PENDING_PAYMENT (terminal statuses free the slot).

CREATE UNIQUE INDEX "checkout_intents_live_pilot_active_attempt_uidx"
ON "checkout_intents" ("organization_id", "report_id")
WHERE "product_code" = 'XRAY_PRO_LIVE_PROBE'
  AND "report_id" IS NOT NULL
  AND "status" IN ('CREATED', 'REDIRECTED', 'PENDING_PAYMENT');
