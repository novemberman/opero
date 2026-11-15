# PR-2 — Korapay sandbox acceptance (pilot prep)

**Date:** 2026-11-15  
**Baseline staging:** API `2915331` (email patch), Web `cc281c3`, Worker `d301cb3`  
**PAYMENT_PROVIDER on shared staging today:** `mock` (do not flip until owner-approved rehearsal)  
**Scope:** Invitation-only production pilot prep. **No live money. No production deploy. No Increment C.**

---

## 1. Gap analysis — implemented vs missing

### Implemented (verified in code)

| Capability | Location |
|------------|----------|
| Korapay Checkout Redirect initialize | `packages/payments/src/providers/korapay.ts` → `POST /merchant/api/v1/charges/initialize` |
| Server-side charge verify | `GET /merchant/api/v1/charges/:reference` |
| Webhook HMAC (`x-korapay-signature` over `JSON.stringify(data)`) | Matches [Korapay docs](https://developers.korapay.com/docs/webhooks); timing-safe compare |
| Webhook receiver + durable `PaymentEvent` | `POST /api/v1/billing/webhooks/korapay` |
| Re-verify before fulfill (never trust webhook alone) | `BillingWebhooksController` + `FulfillmentService` |
| Amount + currency match before entitlement | `fulfillVerifiedPayment` |
| Checkout + Payment + Purchase + Entitlement persistence | Prisma Phase 7A |
| Idempotent fulfill lock + webhook dedupe | `Payment.fulfillmentLock`, unique `providerEventKey` |
| Purchase refund revoke via `refund.success` | `applyRefund` → revoke `PURCHASE` grants |
| Staging mock settle (org-scoped, production 404) | `mockSettleAndFulfill` |
| Env guards: prod forbids mock / `sk_test_`; staging forbids `sk_live_` | `apps/api/src/config/env.ts` |
| PDF / full-report entitlement gates | `EntitlementsService` + reports download |

### Missing or incomplete

| Gap | Impact for pilot |
|-----|------------------|
| Chargeback / dispute webhook handling | **P0 for real money** — Korapay dashboard can send chargebacks; Opero ignores unknown events (no revoke) |
| Outbound Refund API | Ops must refund in Korapay dashboard; inbound `refund.success` works |
| `refund.failed` handling | Safe no-op today; no explicit audit |
| Payment ledger ↔ Korapay reconciliation job | Manual ops until built |
| Checkout `expiresAt` enforcement | TTL stored (1h) but not enforced |
| Direct Debit / auto-renew | Explicitly not wired; subscription is manual renew only |
| Dedicated live sandbox E2E against `sk_test_` | Not run on shared staging yet |
| Subscription-origin refund revoke | Refund path revokes **PURCHASE** grants only |

### Supported Korapay sandbox operations (provider docs + adapter)

| Operation | Sandbox (`sk_test_`) | Opero support |
|-----------|----------------------|---------------|
| Initialize checkout | Yes (same API host) | Yes |
| Customer completes test charge | Yes (Korapay test instruments) | Via redirect URL |
| Verify charge | Yes | Yes |
| `charge.success` / `charge.failed` webhooks | Yes (`notification_url` + dashboard) | Yes |
| Invalid signature | N/A (forge locally) | Reject / no grant |
| Duplicate webhook | Dashboard resend / retries ≤72h | Idempotent |
| Pending charge | Yes | **Fixed locally:** no grant, ledger stays `PENDING` |
| Refund (dashboard/API) → `refund.success` | Yes | Revoke purchase entitlements |
| Chargeback | Dashboard webhook category | **Not implemented** |

Mode is **key prefix**, not a separate host: `KORAPAY_BASE_URL=https://api.korapay.com` with `sk_test_` / `pk_test_`.

---

## 2. Security findings

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| S1 | Webhook authenticity via documented HMAC of `data` + secret key | — | **PASS** (implemented) |
| S2 | Fulfillment only after `verifyTransaction` | — | **PASS** |
| S3 | Amount/currency/org binding on fulfill | — | **PASS** |
| S4 | Pending verify previously marked payment `FAILED` (misleading; later success still worked) | **P1** | **Fixed locally** → return `PENDING`, leave ledger pending |
| S5 | Invalid signature → 200 ack, no grant, unique invalid event key | — | **PASS** |
| S6 | Cross-tenant payment/PDF access denied | — | **PASS** (integration-tested) |
| S7 | Mock settle forbidden in production + non-mock | — | **PASS** |
| S8 | Secrets not returned in checkout/settle API bodies | — | **PASS** (tests assert) |
| S9 | No chargeback revoke | **P0 before live money** | Open |
| S10 | Mock provider uses `===` for HMAC (test-only) | **P3** | Acceptable for mock |
| S11 | `rawVerifySnapshot` stores provider JSON in DB (no secret key in body) | **P2** | Review retention / PII |

**Financial contract (happy path):**  
`PENDING` → (verify success + amount/currency match + lock) → `SUCCEEDED` + entitlements → PDF unlock.  
Refund `refund.success` → `REFUNDED` + purchase grants revoked → PDF 403.  
Pending/failed never grant.

---

## 3. Required implementation changes (this PR-2 prep commit)

| Change | Why |
|--------|-----|
| `fulfillment.service.ts` — pending/abandoned → `PENDING` (no ledger fail) | Sandbox redirect-before-settle must not poison payments |
| `checkout.service.ts` — surface `PENDING` on verify response | Accurate client/ops status |
| `billing.integration.test.ts` — expect `PENDING` on unsettled verify | Contract lock |
| `packages/payments/.../korapay.test.ts` — unit tests for init/verify/HMAC/refund mapping | Deterministic provider coverage without live keys |

**Not in this commit:** chargeback handler, outbound refunds, reconciliation worker, flipping Railway `PAYMENT_PROVIDER`.

---

## 4. Sandbox credential & webhook checklist

### Korapay dashboard (test mode)

1. Create/access Korapay **test** merchant account.
2. Copy `sk_test_…` and `pk_test_…` (never `sk_live_` on staging).
3. Ensure Checkout Redirect / charges API enabled for the merchant.
4. Note test card / bank instruments from Korapay test docs.

### Railway staging (apply only after owner approval)

| Variable | Sandbox rehearsal value | Mock baseline (current safe default) |
|----------|-------------------------|--------------------------------------|
| `PAYMENT_PROVIDER` | `korapay` | `mock` |
| `KORAPAY_SECRET_KEY` | `sk_test_…` | unset or unused |
| `KORAPAY_PUBLIC_KEY` | `pk_test_…` | unset |
| `KORAPAY_BASE_URL` | `https://api.korapay.com` | default |
| `BILLING_WEBHOOK_BASE_URL` | `https://opero-staging.up.railway.app/api/v1` | same |

**Webhook URL to register / send as `notification_url`:**  
`https://opero-staging.up.railway.app/api/v1/billing/webhooks/korapay`

Also set the same URL in Korapay dashboard API Configuration if required for chargebacks/transfers (chargebacks still need product support before live money).

### Preserve mock baseline / rollback to mock

1. Set `PAYMENT_PROVIDER=mock`.
2. Remove or leave unused `KORAPAY_SECRET_KEY` / `KORAPAY_PUBLIC_KEY` (optional).
3. Redeploy **API only** (or restart) so Nest rebinds `MockKorapayProvider`.
4. Confirm `/api/v1/ops/status` → `paymentProvider: "mock"`.
5. Confirm mock settle + PDF entitlement path still works (P0-B baseline).

**Do not overwrite unrelated staging secrets while flipping payment vars.**

---

## 5. Acceptance test matrix

| # | Case | Method | Pass criteria |
|---|------|--------|---------------|
| 1 | Successful sandbox charge + verified settlement | Live `sk_test_` rehearsal **or** mock settle | Entitlements granted; PDF 200 |
| 2 | Valid signed webhook | Integration + live | Re-verify + fulfill; 200 |
| 3 | Invalid webhook signature | Integration (forge) | 200 ack; no entitlement; `valid:false` |
| 4 | Duplicate webhook | Replay same event key | `duplicate:true`; still single fulfill |
| 5 | Pending payment | Verify before settle | **No grant**; status `PENDING` (not FAILED) |
| 6 | Failed payment | `charge.failed` / settle failed | No grant; payment `FAILED` |
| 7 | Incorrect amount/currency | Integration (tamper verify) | `AMOUNT_MISMATCH` / `CURRENCY_MISMATCH`; no grant |
| 8 | Unknown transaction reference | Verify / webhook | 404 / `matched:false`; no grant |
| 9 | Cross-tenant access | Integration | 404 on foreign org payment/PDF |
| 10 | Refund + entitlement revocation | `refund.success` (mock/integration; live if sandbox refund available) | Grants revoked; PDF 403 |
| 11 | Report download before/after payment | Integration / staging smoke | 403 → 200 → (refund) 403 |
| 12 | Webhook retry / recovery | Duplicate + deferred fulfill after prior pending | Idempotent; eventual fulfill after success verify |

**Sandbox limitations:** Chargebacks and some refund edge cases may be dashboard-only; cover with deterministic integration tests and **do not claim live sandbox coverage** for those rows.

---

## 6. Validation results (local)

| Suite | Result |
|-------|--------|
| `@opero/payments` (incl. new Korapay unit tests) | **14/14 PASS** |
| API billing integration + mock-settle + env | **35/35 PASS** |
| `tsc` apps/api, apps/web, packages/payments | **PASS** |
| Docker `Dockerfile.api` → `opero-api:pr2-korapay` | **PASS** |
| Docker `Dockerfile.web` → `opero-web:pr2-korapay` | **PASS** |

---

## 7. Deployment & rollback plan (when owner authorizes)

### Deploy order (staging only)

1. Merge/push PR-2 prep commit (pending-safe fulfill + Korapay unit tests).
2. Keep `PAYMENT_PROVIDER=mock` until rehearsal window.
3. API auto-deploy; confirm SUCCESS + health/ready.
4. Owner sets Korapay sandbox secrets + `PAYMENT_PROVIDER=korapay`.
5. API restart/redeploy; confirm `ops/status.paymentProvider=korapay`.
6. Execute matrix rows 1–12 (live where possible).
7. Return to mock (section 4) before ending the window.

### Rollback

| Target | Action |
|--------|--------|
| Payment mode | `PAYMENT_PROVIDER=mock` + API restart |
| Code | Redeploy previous API deployment / SHA |
| Web / worker | Unchanged unless a later commit requires them |

**Current rollback SHAs (pre–PR-2 code flip):** API `2915331` / deploy `135a3d1a…`; Web `8be6947d` @ `cc281c3`; Worker `a0d84580` @ `d301cb3`.

---

## 8. Outstanding production blockers (pilot)

1. **Chargeback handling** before real money.  
2. Owner-approved **Korapay live KYC + `sk_live_`** (production only; never on staging).  
3. Finalized **legal / refund policy** (placeholders remain).  
4. Monitoring/alerting for payment verify failures and webhook deferrals.  
5. Documented ops runbook for dashboard refunds + mock↔korapay staging flip.  
6. Optional: reconciliation job; checkout expiry worker.

---

## 9. Verdict

**Architecture is sandbox-ready after the pending-payment fix and provider unit tests.**  
Shared staging should remain on **mock** until an owner-scheduled Korapay `sk_test_` rehearsal.  
**Not** authorized for live money or production.

**Stop for owner review.**
