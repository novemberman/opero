# PR-2L-A — Chargeback and dispute protection

**Date:** 2026-11-15  
**Status:** Implemented locally (not pushed / not deployed)  
**Release audit:** `PR2L-A-RELEASE-SECURITY-AUDIT.md` — **PASS WITH OWNER GATES**  
**Closes readiness gap B1** from `PR2L-KORAPAY-LIVE-PAYMENT-READINESS.md`

---

## 1. Supported Korapay event contracts

Documented sources only ([Webhooks](https://developers.korapay.com/docs/webhooks), [Chargebacks](https://developers.korapay.com/docs/chargebacks)):

| Event | Opero handling |
|-------|----------------|
| `charge.success` / `charge.failed` | Re-verify + fulfill (unchanged); **blocked** if payment already `DISPUTED`/`CHARGEBACK`/`REFUNDED` |
| `refund.success` | Revoke PURCHASE entitlements → `REFUNDED` |
| `refund.failed` | Logged; no entitlement change |
| `chargeback.pending` | Suspend access → `DISPUTED` |
| `chargeback.declined` | Keep suspended → `DISPUTED` (merchant contested; not a win) |
| `chargeback.lost` | Permanent revoke → `CHARGEBACK` |
| `chargeback.partial` | Permanent revoke → `CHARGEBACK` (digital goods: no partial PDF access) |
| `chargeback.auto_accepted` | Permanent revoke → `CHARGEBACK` |

**Not invented / not handled as a webhook:** `chargeback.won` — Korapay docs list won outcomes in prose and sandbox complete API, but **do not** list a `chargeback.won` webhook event. Merchant-favor restore uses the **manual** dispute API.

Chargeback payment reference resolution uses documented nested `data.payment.reference` (and `payment_reference` fallback). Chargeback id `data.reference` (`KPY-CHG-…`) is for dedupe only.

---

## 2. State transitions

```
SUCCEEDED ──chargeback.pending/declined──► DISPUTED ──lost/partial/auto_accepted──► CHARGEBACK
    │                                         │
    │                                         └── manual resolve_merchant_favor ──► SUCCEEDED (+ restore)
    ├── refund.success ──► REFUNDED
    └── manual confirm_chargeback ──► CHARGEBACK

Severity (out-of-order safe): SUCCEEDED < DISPUTED < REFUNDED < CHARGEBACK
Late softer events are ignored; grants stay revoked.
```

Historical `payments`, `payment_events`, `purchases`, `entitlement_grants`, and `payment_dispute_actions` rows are preserved (grants get `revoked_at` / reason; no hard deletes).

---

## 3. Entitlement behavior

| State | PURCHASE grants for that payment | PDF download |
|-------|----------------------------------|--------------|
| SUCCEEDED (fulfilled) | Active | Allowed |
| DISPUTED | Suspended (`revoked_at` set) | `403 ENTITLEMENT_REQUIRED` |
| CHARGEBACK / REFUNDED | Revoked | `403 ENTITLEMENT_REQUIRED` |
| Sibling report / other purchase | Unaffected | Still allowed if entitled |

**Limitation (documented in API responses + audits):** previously downloaded PDF files **cannot be remotely recalled**; only subsequent downloads are blocked.

---

## 4. Security findings

| Control | Result |
|---------|--------|
| Invalid webhook signature | Ack 200; no entitlement change; unique `invalid:…` event key |
| Duplicate webhooks | Idempotent via `providerEventKey` |
| Out-of-order chargeback | Harder status wins; no soften |
| Late verify after chargeback | `ACCESS_REVOKED`; no grant restore |
| Cross-tenant manual dispute | `404 PAYMENT_NOT_FOUND` |
| Manual path permissions | `billing:manage` (OWNER/ADMIN) only |
| Manual path not a settle bypass | Cannot create payments or grant without prior SUCCEEDED purchase |
| Unverified webhooks | Cannot alter entitlements |

---

## 5. Migration requirements

Migration: `packages/database/prisma/migrations/20261115193000_pr2l_a_payment_disputes/`

- Adds `PaymentStatus.DISPUTED`, `PaymentStatus.CHARGEBACK`
- Adds `PurchaseStatus.DISPUTED`
- Creates `payment_dispute_actions` audit table

Apply with `pnpm migrate:deploy` / `prisma migrate deploy` on each environment before deploying API code that references the new model.

---

## 6. Test results

| Suite | Result |
|-------|--------|
| `@opero/payments` unit (incl. webhook-references + chargeback parse) | **22 passed** |
| `apps/api` `billing.integration.test.ts` (13 tests, incl. chargeback + manual) | **13 passed** |
| Security + report download suites | **24 passed** |
| `apps/api` `tsc --noEmit` | **pass** |
| `Dockerfile.api` build (`opero-api:pr2la-audit`) | **pass** |

---

## 7. Deployment and rollback plan

**Deploy (when owner authorizes):**
1. Migrate DB (prod/staging/rehearsal as applicable).
2. Deploy API (web unchanged required).
3. Confirm Korapay dashboard webhook URL still hits `/api/v1/billing/webhooks/korapay`.
4. Smoke: mock or sandbox chargeback.pending → PDF 403.

**Rollback:**
1. Redeploy previous API image.
2. Keep migration (enum/table additive — safe to leave).
3. Do not delete dispute audit rows.

---

## 8. Remaining provider-specific limitations

1. No documented `chargeback.won` webhook → manual `resolve_merchant_favor`.
2. Chargeback list/get APIs exist but are **not** polled yet (no reconciliation job).
3. Outbound Refund / chargeback respond APIs not wired (dashboard ops).
4. Partial chargebacks revoke full digital access (by design).
5. Previously downloaded files cannot be recalled.
6. Sandbox Gate C hosted checkout still unproven end-to-end (separate from this PR).

---

## Key code

- `packages/payments/src/webhook-references.ts`
- `apps/api/src/billing/fulfillment.service.ts` — `applyChargebackEvent`, `applyManualDisputeAction`
- `apps/api/src/billing/webhooks.controller.ts`
- `POST …/billing/payments/:reference/disputes`
