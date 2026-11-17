# M13-B2 — KORAPAY POST-PAYMENT REDIRECT REPAIR

**Date:** 2026-11-17  
**Authorization:** Local development + isolated `korapay-rehearsal` acceptance only  
**Verdict:** **PASS** (local + rehearsal route resolution). Production promotion **not** authorized.

**STOP FOR OWNER REVIEW.**

---

## Root cause (verified)

Gate C sandbox payment `opero_29ef27116f97489c9cba9a4a183f8a2f` stored:

`redirect_url = https://opero-web-korapay-rehearsal.up.railway.app/billing/return`

Korapay correctly redirects to that URL with `?reference=…` after hosted checkout.

**There was no Next.js route at `/billing/return`**, so the web app returned **HTTP 404**.

Not caused by: webhook failure, entitlement failure, reverse-proxy misrouting of `/api`, or Railway env for `BILLING_WEBHOOK_BASE_URL` (settlement path already PASS in M13-B).

Product unlock UI previously used `/organizations/:orgId/billing?reportId=…`, but API/agent checkouts (and IT fixtures) used `/billing/return`, which did not exist.

---

## Correction

| Change | Detail |
|--------|--------|
| Web route | Added `apps/web/src/app/billing/return/page.tsx` — reads `reference`, calls API return-context, routes to org billing |
| API | `GET /billing/payments/return-context?reference=` (session) — membership-scoped lookup; no provider verify; no grant |
| Redirect hygiene | Checkout always resolves redirect to same-origin `APP_ORIGIN`; default `${APP_ORIGIN}/billing/return`; foreign origins rejected |
| Unlock UI | Uses canonical `/billing/return` so Korapay `?reference=` append is clean |
| Billing UX | Verify banner + bounded pending polls + **Check status again** (verify only; no new checkout) |
| Security | URL alone never grants; cross-org return-context → 404; unauthenticated → 401 |

Webhook / fulfill / entitlement logic unchanged.

---

## Test evidence (local)

| Suite | Result |
|-------|--------|
| `checkout-redirect.unit.test.ts` | **PASS** (3) |
| `billing.integration.test.ts` (incl. return-context) | **PASS** (17) |
| `billing-return.test.ts` | **PASS** (2) |
| `@opero/api` typecheck | **PASS** |
| `@opero/web` typecheck | **PASS** |
| `@opero/web` build | **PASS** — route `ƒ /billing/return` present |

---

## Rehearsal acceptance

| Check | Result |
|-------|--------|
| Target | `korapay-rehearsal` only (`opero-api` + `opero-web`) |
| Feature SHA | _(filled after commit/deploy)_ |
| `/billing/return` HTTP | no longer 404 (page loads) |
| Existing ref return URL | `…/billing/return?reference=opero_29ef2711…` resolves (auth required for context) |
| Return-context API | org + report for Gate C ref when session member |
| Grants / payments | unchanged for existing tx (read-only reuse) |
| New payment | **not** initiated |
| Production | unchanged |

---

## Production deployment prerequisites (owner)

1. Deploy **API + Web** together on the feature SHA (return-context + `/billing/return`).  
2. No new env vars; no migrations.  
3. Keep `EMERGENCY_DISABLE_CHECKOUT=true` until separate live-checkout auth.  
4. Rollback: redeploy prior API+Web tips; route absence returns prior 404 only (settlement still webhook-safe).

---

## Residual

- Historical Gate C checkout still points at `/billing/return` — fixed once web is deployed.  
- Unauthenticated return shows sign-in prompt (login has no `next=` deep-link yet).  
- Live-money Gate C still out of scope.
