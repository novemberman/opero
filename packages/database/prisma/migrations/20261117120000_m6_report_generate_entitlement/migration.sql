-- M6: grant xray.report_generate on Opero OS plans (organization scope).
-- X-Ray Pro purchases grant the same code via XRAY_PRO_ENTITLEMENTS in application code.
-- Idempotent inserts for local/rehearsal/production apply.

INSERT INTO "plan_entitlements" ("id", "plan_id", "entitlement_code", "limit_value", "metadata")
VALUES
  (
    '55555555-5555-4555-8555-55555555550c',
    '44444444-4444-4444-8444-444444444402',
    'xray.report_generate',
    NULL,
    '{"scope":"organization"}'::jsonb
  ),
  (
    '55555555-5555-4555-8555-55555555550d',
    '44444444-4444-4444-8444-444444444403',
    'xray.report_generate',
    NULL,
    '{"scope":"organization"}'::jsonb
  )
ON CONFLICT ("plan_id", "entitlement_code") DO NOTHING;
