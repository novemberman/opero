# Opero agent handoff

Date: 2026-11-13 (Phase 7A Korapay integration audit complete — awaiting owner Git checkpoint)
Workspace: `/home/opero/projects/opero`
Branch: `main`
Remote: private GitHub repository `novemberman/opero` (`git@github.com:novemberman/opero.git`)
HEAD baseline: `75a1ed4` (Phase 6C). Phase 7A remains **uncommitted**.
Phase: **Phase 7A** audited vs official Korapay docs. **Do not commit/push/deploy until owner approves.**

## Phase status

| Phase | Status |
| --- | --- |
| Phase 5 financial diagnostics | `dc8e4ee` |
| Phase 6 / 6B / 6C AI reports + publication integrity | `75a1ed4` |
| Phase 7A Nigerian commercialization (Korapay) | Implemented + integration audit locally — no commit yet |

## Phase 7A notes

| Area | Status |
| --- | --- |
| Primary provider | Korapay (mock default; no Paystack) |
| Migration | `20261113180000_phase7a_commercialization` (+ launch catalog seed) |
| Package | `@opero/payments` |
| Webhook | `POST /api/v1/billing/webhooks/korapay` via `BILLING_WEBHOOK_BASE_URL` + dashboard |
| Entitlements | Orthogonal to RBAC; PDF/full published report gated |
| Subscriptions | Manual `SUBSCRIPTION_RENEW` only; Direct Debit not assumed |
| Docs | `docs/PHASE7A_BILLING.md` |
| Sandbox live provider tests | Pending (no sandbox secrets in local env) |

### Residual / production risks

- Live/sandbox Korapay credentials and public webhook URL not configured locally.
- Korapay recurring Direct Debit not integrated — renewals are manual by design.
- No Postgres RLS; tenant isolation remains service-layer.
- Frontend billing UI is functional MVP, not polished commerce UX.
- No Railway / live payments.

## Exact next steps (owner-gated)

1. Review Phase 7A Korapay audit completion report; approve commit/push when ready.
2. Prefer `pnpm db:migrate`. Never `migrate reset` unless explicitly requested.
3. Do not process live payments or deploy to Railway until approved.
