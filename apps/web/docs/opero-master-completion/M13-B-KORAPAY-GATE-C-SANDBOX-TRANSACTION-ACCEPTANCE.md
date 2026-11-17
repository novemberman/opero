# M13-B KORAPAY GATE C — ONE CONTROLLED SANDBOX TRANSACTION

**Date:** 2026-11-17  
**Authorization:** `AUTHORIZE OPERO M13-B GATE C SANDBOX VERIFY AND FULFILL` (prior init under Gate C sandbox auth)  
**Verdict:** **PASS** — one genuine Korapay **sandbox** checkout completed end-to-end on `korapay-rehearsal` only: provider `success` → signed webhook → verify-before-fulfill → PURCHASE entitlements → entitled PDF 200 / sibling 403. **Merchant bank payout not claimed** (sandbox N/A). No live charges. Production unchanged.

**STOP FOR OWNER REVIEW.**

---

## Hard safety (honored)

| Rule | Status |
|------|--------|
| No `sk_live_` on this path | **PASS** — rehearsal `sk_test_` / `pk_test_` only |
| No production DB/env/deploy/migrate | **PASS** |
| No production checkout/upload/registration enable | **PASS** — prod emergencies still ON |
| No fabricated webhook/settle | **PASS** — authentic Korapay `charge.success` + HMAC |
| No automatic second checkout | **PASS** — exactly one new init |
| Correlation ID | `M13B-GC-20261117T113547Z` |

---

## A. Historical Gate C finding (unchanged)

| # | Question | Finding |
|---|----------|---------|
| 1 | Transaction reference | `opero_af4def5d681d4d41bfed4b95667bf5b0` |
| 2 | Sandbox vs live | **Sandbox** — `korapay-rehearsal`, `test-checkout.korapay.com`, `sk_test_` |
| 3 | Amount / currency | `1500000` minor = **₦15,000.00 NGN** |
| 4–10 | Outcome | Hosted UI never completed; Korapay `processing` / `amount_paid=0`; Opero stayed **`PENDING`**; **0** webhooks; **no** entitlement |

Historical unpaid session ≠ failed settlement. Superseded for Gate C sandbox proof by the new reference below.

---

## B. New sandbox transaction — **PASS**

### Environment isolation

| Check | Result |
|-------|--------|
| Env | `korapay-rehearsal` |
| API | `https://opero-api-korapay-rehearsal.up.railway.app` |
| Webhook base | `https://opero-api-korapay-rehearsal.up.railway.app/api/v1` |
| Secret mode | **`sk_test_`** |
| Prod emergencies | checkout **ON**, uploads **ON**, registration **false** |
| Rehearsal checkout window | Temporarily OFF for init → restored **ON** |

### Checkout (Phase 5)

| Field | Value |
|-------|--------|
| Checkout intent | `5307c05b-bba6-44c6-8c16-75e8ce4794bc` → **`SUCCEEDED`** |
| Payment ID | `adc1c3df-f506-48f5-85e4-1b6f6a0d36e6` → **`SUCCEEDED`** / fulfilled |
| Reference | `opero_29ef27116f97489c9cba9a4a183f8a2f` |
| Amount / currency | `1500000` / `NGN` (₦15,000) |
| Hosted URL | `https://test-checkout.korapay.com/KPY-PI-202611171136vL20Hi41047/pay` |
| Org / report | `a8c59283-…` / purchase `1b0e8db6-…` · sibling `9d69be1c-…` |

### Payment completion (Phase 6)

Owner interactive sandbox test instrument on hosted Checkout. Korapay charge retrieved:

- `status=success`
- `amount_paid=15000.00` / `amount=15000.00` / `currency=NGN`
- `transaction_date=2026-11-17T11:41:59.000Z`
- Customer email matches Gate C fixture owner

### Verify + webhook + fulfill (Phases 7–9)

| Check | Evidence |
|-------|----------|
| Korapay verify | `success` · ₦15,000 paid (not `processing`/₦0) |
| Webhook | `payment_events` id `769d4876-…` · `charge.success` · `signature_valid=true` · `process_result=accepted` · key `korapay:charge.success:opero_29ef2711…:success` · `2026-11-17T11:42:00.281Z` |
| Opero ledger | Payment **`SUCCEEDED`** · intent **`SUCCEEDED`** · `fulfilled=true` |
| Audits | `billing.payment_fulfilled` @ 11:42:01Z · `billing.payment_verified` @ 11:46:27Z |
| Entitlements | **3** active `PURCHASE` grants on payment source: `xray.full_report`, `xray.pdf_download`, `xray.report_generate` |
| Opero verify API | `providerStatus=success` · fulfillment `ALREADY_FULFILLED` (webhook fulfilled first) |
| Entitled PDF | HTTP **200** · `application/pdf` · 5705 bytes · report `1b0e8db6-…` |
| Sibling PDF | HTTP **403** · `ENTITLEMENT_REQUIRED` · report `9d69be1c-…` |

### Security / idempotency (Phases 10–11)

| Check | Result |
|-------|--------|
| Invalid signature POST | HTTP 200 · `{received:true, valid:false}` · durable `invalid_signature` event · **no** new grants |
| Authentic webhook replay | HTTP 200 · `{received:true, duplicate:true}` · dedupe key unchanged · **still 3** active grants |
| Idempotent verify | `ALREADY_FULFILLED` · grants unchanged at **3** |
| Merchant bank payout | **N/A — not claimed** (sandbox) |

### Production safety recheck (Phase 12)

| Check | Result |
|-------|--------|
| `EMERGENCY_DISABLE_CHECKOUT` (prod API) | `true` |
| `EMERGENCY_DISABLE_UPLOADS` (prod API + worker) | `true` |
| `PUBLIC_REGISTRATION_ENABLED` | `false` |
| `PILOT_UPLOAD_ENABLED` | `false` |
| Prod mutations this mission | **None** |
| Probe sessions | Revoked (`22725119-…`); `/auth/me` → **401** |

---

## C. Verdict matrix

| Claim | Result |
|-------|--------|
| Checkout initiated | **PASS** |
| Payment completed (sandbox) | **PASS** |
| Payment verified (`success` + amount match) | **PASS** |
| Webhook authenticated | **PASS** |
| Entitlement issued (scoped PURCHASE) | **PASS** |
| Entitled PDF / sibling lock | **PASS** |
| Idempotent replay / invalid signature | **PASS** |
| Merchant settlement confirmed | **N/A / NOT CLAIMED** |
| Live-money Gate C | **NOT IN SCOPE** |
| Gate C **sandbox** fully passed | **YES** |

**Overall:** **PASS** (sandbox settlement + fulfill). Live commercial settlement and merchant payout remain out of scope.

---

## D. Residual / not claimed

- Production checkout remains emergency-disabled; live `sk_live_` unused on this path.
- Historical `opero_af4def5d…` may remain `PENDING` unpaid — harmless.
- Public commercial launch still **NO-GO** pending live-AI + live-payment policy (see M13 commercial report).
