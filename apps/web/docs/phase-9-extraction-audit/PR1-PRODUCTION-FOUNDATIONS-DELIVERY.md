# PR-1 Production Foundations — Delivery Report

**Date:** 2026-11-15  
**Commit:** local `main` tip (not pushed; see `git log -1`)  
**Authorization boundaries honored:** no GitHub push, no Railway deploy, no production provision, no live payments, no Increment C.

**Reference:** `PR0-PRODUCTION-READINESS-ASSESSMENT.md`  
**Approved staging baseline (unchanged by this PR):** API/Web `cc7041f`, Worker `d301cb3`

---

## 1. Implementation summary

### Workstream A — Legal & consent (draft)

| Page | Path |
|------|------|
| Terms of Service | `/legal/terms` |
| Privacy Policy | `/legal/privacy` |
| Financial analysis limitations | `/legal/financial-disclaimers` |
| Payments, refunds & cancellation | `/legal/payments` |

- Nigeria as initial governing jurisdiction; placeholders for entity/contact details.
- Draft banner: requires qualified legal review; **no mandatory consent checkbox**.
- Links from: registration, login footer, checkout/unlock + billing, website footer.

### Workstream B — Production isolation

- Blueprint: `PR1-PRODUCTION-ISOLATION-BLUEPRINT.md` (no resources provisioned).

### Workstream C — Monitoring

- Plan: `PR1-MONITORING-AND-INCIDENT-RESPONSE.md`.
- Staging-verifiable: `GET /api/v1/ops/status` (health/redis/db + queue depths + pilot/emergency flags).
- No notification recipients configured.

### Workstream D — Security baseline

- Swagger/OpenAPI **off by default in production** (`resolveEnableApiDocs`); opt-in via `ENABLE_API_DOCS=true`.
- API security headers: nosniff, frame deny, referrer-policy, permissions-policy, COOP; HSTS in production.
- Web middleware mirrors baseline headers.
- Existing session/CSRF/throttle/private storage/`PAYMENT_PROVIDER=mock` bans preserved.
- Mock settle additionally 404s when `APP_ENV=production`.

### Workstream E — Pilot controls

- Design: `PR1-PILOT-ACCESS-CONTROLS.md`.
- Flags: `PILOT_MODE`, `PUBLIC_REGISTRATION_ENABLED`, `PILOT_INVITE_CODE`, `PILOT_MAX_*`, `EMERGENCY_DISABLE_*`.
- Defaults keep staging/dev usable; production + pilot requires closed registration.

---

## 2. Owner decisions required (legal)

Replace placeholders before counsel sign-off:

- `[OPERATOR_LEGAL_NAME]`, `[RC_NUMBER_PLACEHOLDER]`, `[REGISTERED_ADDRESS_PLACEHOLDER]`
- `[LEGAL_NOTICE_EMAIL_PLACEHOLDER]`, `[PRIVACY_REQUEST_EMAIL_PLACEHOLDER]`
- `[SUPPORT_CONTACT_PLACEHOLDER]`, `[BILLING_SUPPORT_EMAIL_PLACEHOLDER]`
- `[REFUND_POLICY_PLACEHOLDER]`, `[TAX_TREATMENT_PLACEHOLDER]`
- `[DISPUTE_VENUE_PLACEHOLDER]`, `[NDPR_REGISTRATION_PLACEHOLDER]`, `[TRANSFER_SAFEGUARD_PLACEHOLDER]`
- Approve final text before activating mandatory consent UI.

---

## 3. Production infrastructure blueprint

See `PR1-PRODUCTION-ISOLATION-BLUEPRINT.md`.

---

## 4. Monitoring & incident response

See `PR1-MONITORING-AND-INCIDENT-RESPONSE.md`.  
Approve `[ONCALL_*]` / support contacts before wiring external alerts.

---

## 5. Pilot access control design

See `PR1-PILOT-ACCESS-CONTROLS.md`.

---

## 6. Security changes & tests

| Change | Test |
|--------|------|
| Env pilot/production validation | `apps/api/src/config/env.test.ts` |
| Security headers + swagger off | `apps/api/src/configure-app.test.ts` |
| Ops status | `apps/api/src/health/ops.controller.test.ts` |
| Existing billing authZ / mock-settle | `billing.integration.test.ts` (regression) |
| Existing security suite | `security.integration.test.ts` |

**Results (local, 2026-11-15)**

- Unit: `env` + `configure-app` + `ops` — **24 passed**
- Integration: `security` + `billing` — **22 passed** (security headers observed on responses)
- Typecheck: `@opero/api`, `@opero/web` — **pass**
- Docker: `Dockerfile.api` / `Dockerfile.web` / `Dockerfile.worker` — **pass** (API rebuild after `resolveEnableApiDocs` typing fix)

---

## 7. Remaining P0 blockers (from PR-0, still open)

1. Live Korapay acceptance (`sk_test_` staging path) before any live money.
2. Lawyer-approved Terms/Privacy (drafts only here).
3. External monitoring recipients + backup restore drill.
4. Automated document retention purge.
5. Chargeback / dispute handlers.
6. Manual browser acceptance on staging.
7. Production project provision (explicitly out of scope for PR-1).

---

## 8. Staging deployment & rollback plan (when owner authorizes)

**Not executed in PR-1.**

1. Push commit (owner) → deploy API then web; worker only if worker changed (this PR is API/web/docs; worker unchanged).
2. Smoke: `/health`, `/ready`, `/ops/status`, login, legal pages, register still works with defaults.
3. Rollback: redeploy previous SHAs — API/Web `cc7041f`, Worker `d301cb3`.
4. Do **not** enable `PILOT_MODE` / closed registration on staging until rehearsal is scheduled.

---

## Changed files (high level)

- `apps/web/src/app/legal/**`, `components/legal/**`, footer/auth/unlock/billing links, `middleware.ts`
- `apps/api/src/config/env.ts`, `configure-app.ts`, `main.ts`, auth/orgs/documents/checkout, `health/ops*`
- `packages/shared` optional `inviteCode` on register
- Docs: `PR1-*.md` under `apps/web/docs/phase-9-extraction-audit/`
