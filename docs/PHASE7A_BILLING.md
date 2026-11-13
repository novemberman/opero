# Phase 7A — Nigerian commercialization (Korapay)

## Launch catalog (NGN, minor units = kobo)

| Code | Amount | Interval |
| --- | --- | --- |
| XRAY_FREE | 0 | one-time |
| XRAY_PRO | 1,500,000 (₦15,000) | one-time per report |
| OS_STARTER | 2,500,000 (₦25,000) | monthly |
| OS_GROWTH | 6,500,000 (₦65,000) | monthly |
| ENTERPRISE | custom | quotation |

Stored under `PricingVersion` `launch.v1`. Future price changes add a new version; historical purchases keep snapshotted amounts.

## Free vs paid

**Free (authenticated org):** documents, readiness, diagnostics preview, draft/review workflow metadata. Published report GETs return `FREE_PREVIEW` without purchase/subscription. PDF download requires entitlement.

**Paid:** `xray.full_report` + `xray.pdf_download` from an X-Ray Pro purchase (report-scoped) or active OS subscription (org-scoped, including grace). Refunds revoke purchase grants. Expired subscriptions revoke org grants; separately purchased report entitlements remain.

RBAC (`billing:manage` / `xray:*`) is separate from commercial entitlements. Both are required.

## Payment architecture

- Package `@opero/payments`: provider port, `KorapayProvider`, `MockKorapayProvider`.
- Korapay Checkout Redirect (official):
  - `POST https://api.korapay.com/merchant/api/v1/charges/initialize`
  - `Authorization: Bearer {SECRET_KEY}`
  - Amount in **major units** (naira integer for whole-naira NGN prices)
  - Optional `notification_url`, `redirect_url`, `narration`, `metadata` (≤5 keys, key ≤20 chars, `[A-Za-z0-9-]`)
  - Response: `data.reference`, `data.checkout_url`
- Verify: `GET /merchant/api/v1/charges/:reference` with Bearer secret
- Webhook HMAC-SHA256 of `JSON.stringify(data)` via `x-korapay-signature`
- Events: `charge.success`, `charge.failed`, `refund.success`, `refund.failed` (+ transfers unused here)
- Refunds: original charge is `data.payment_reference`; refund id is `data.reference`
- Opero stores kobo; Korapay APIs use major units (naira).
- Success is never based on client redirect alone — always server verify + amount/currency match + idempotent fulfillment lock.
- **No Paystack.** No live charges in Phase 7A (`PAYMENT_PROVIDER=mock` by default).
- Same API host for test and live; mode is selected by `sk_test_` vs `sk_live_` keys. Production forbids `sk_test_`.

## Subscriptions (manual renewal)

Korapay Direct Debit / fixed authorizations exist in their docs but are **not assumed available** for this merchant account and are **not wired**.

Renewals are explicit one-time checkouts (`SUBSCRIPTION_RENEW`) after the customer authorizes payment. Period start/end dates are maintained on `Subscription`. Renewal reminders are audit-recorded via:

- `GET .../billing/subscriptions/renewals-due`
- `POST .../billing/subscriptions/:id/remind`

**Never debit a customer automatically without an approved mandate.**

Domain lifecycle: `PENDING_PAYMENT` → `ACTIVE` → `GRACE` (3 days) → `EXPIRED` / `CANCELED`.

## Webhook endpoint and configuration

### Opero endpoint

```
POST {BILLING_WEBHOOK_BASE_URL}/billing/webhooks/korapay
```

Example when `BILLING_WEBHOOK_BASE_URL=https://api.example.com/api/v1`:

```
https://api.example.com/api/v1/billing/webhooks/korapay
```

- No secrets in the URL
- CSRF exempt (server-to-server); signature verified before processing
- Invalid signatures acknowledged with HTTP 200 + `valid: false` (Korapay retry guidance) and never grant value
- Durable `PaymentEvent` audit with unique `providerEventKey` (replay protection)
- On `charge.success` / `charge.failed`: re-verify via charges API, then fulfill/fail idempotently
- On `refund.success`: revoke purchase entitlements using `payment_reference`

Checkout initialize also sends the same URL as Korapay `notification_url` when `BILLING_WEBHOOK_BASE_URL` is set (per-transaction override of the dashboard webhook).

### Korapay dashboard setup

1. Sign in to the Korapay merchant dashboard (test or live mode matching your keys).
2. Open **Settings → API Configuration**.
3. Set the **Webhook URL** to the public HTTPS URL above (no query secrets).
4. Ensure the URL is publicly reachable from Korapay (do **not** expose local dev tunnels solely for this audit).
5. Optionally rely on per-checkout `notification_url` (wired when `BILLING_WEBHOOK_BASE_URL` is set); dashboard URL remains the fallback for refunds and other events.
6. Confirm HMAC verification uses your **secret key** (`sk_test_` / `sk_live_`).

### Environment variables

| Variable | Purpose |
| --- | --- |
| `PAYMENT_PROVIDER` | `mock` (default) or `korapay` |
| `KORAPAY_SECRET_KEY` | Required for `korapay`; never commit; never ship to the browser |
| `KORAPAY_PUBLIC_KEY` | Optional; Checkout Standard only (Opero uses Redirect) |
| `KORAPAY_BASE_URL` | Default `https://api.korapay.com` |
| `BILLING_WEBHOOK_BASE_URL` | Public API base including `/api/v1` (no trailing slash required) |

## Sandbox validation checklist

1. Obtain Korapay **test** keys (`sk_test_…`, `pk_test_…`) from the dashboard. Do not paste them into chat or commits.
2. Set `PAYMENT_PROVIDER=korapay`, `KORAPAY_SECRET_KEY=sk_test_…`, and a publicly reachable `BILLING_WEBHOOK_BASE_URL` only in a staging environment (not local expose-for-webhook).
3. Configure the dashboard webhook URL to the staging endpoint.
4. Initialize an X-Ray Pro checkout; complete payment in Korapay test checkout.
5. Confirm webhook `charge.success` arrives, signature verifies, and PDF unlocks only after server verify.
6. Replay the webhook; entitlements must not duplicate.
7. Forge a bad signature; value must not unlock.
8. Initiate a sandbox refund; confirm `refund.success` revokes purchase entitlements.
9. Start OS Starter via checkout; confirm period dates; cancel-at-period-end; confirm no auto-debit.
10. Mark live (`sk_live_`) testing **pending** until owner KYC/activation and explicit approval.

**Sandbox status for this audit:** live provider testing **pending** — no valid sandbox credentials were configured in the local environment for non-mock runs. Mock provider coverage exercises the same fulfillment/webhook paths without network I/O.

## Security controls covered by tests

- Invalid webhook signatures rejected (no entitlement)
- Duplicate webhook events do not duplicate entitlements
- Transaction references scoped to organization (cross-tenant verify 404)
- Amount / currency mismatches fail closed
- Browser success redirects cannot grant paid access
- Refunds revoke applicable entitlements (`payment_reference`)
- Subscription expiration removes org subscription benefits; one-time purchases retain report entitlements
- Concurrent payment verification cannot double-fulfill
