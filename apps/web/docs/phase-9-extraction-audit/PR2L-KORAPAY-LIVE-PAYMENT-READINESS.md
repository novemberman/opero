# PR-2L — Korapay live payment readiness

**Date:** 2026-11-15  
**Scope:** Assessment and preparation only  
**Restrictions observed:** No live keys requested/printed · no `PAYMENT_PROVIDER` change · no provision/deploy · no live charges · no Increment C

---

## 1. Live-payment readiness verdict

### **NOT READY for unsupervised live money**

### **CONDITIONALLY READY for one owner-supervised live charge** only after critical blockers below are cleared (or explicitly accepted in writing) and an isolated production payment environment exists.

| Layer | Assessment |
|-------|------------|
| Happy-path charge → HMAC webhook → server re-verify → amount/currency match → idempotent entitlement | **Sound in code** |
| Mock settle blocked when provider ≠ mock / `APP_ENV=production` | **Sound** |
| Client cannot set price | **Sound** (catalog-priced) |
| Cross-tenant checkout / verify / PDF | **Sound** (integration-tested) |
| Sandbox Gate C end-to-end settle proof | **Missing** (hosted test page stuck `processing` / ₦0) |
| Chargeback / dispute revoke | **Missing (P0)** |
| Isolated production payment stack | **Not provisioned** (by design this phase) |
| Payment failure alerting | **External only** (ops note: wire Railway/uptime monitors) |
| Low-value live test price | **Not defined** (catalog XRAY_PRO = ₦15,000) |

**Product stance (consistent with `PR2-KORAPAY-SANDBOX-ACCEPTANCE.md`):** chargeback handling is **P0 before live money**. Without it, a Korapay chargeback can leave Opero entitlements unlocked.

---

## 2. Remaining critical blockers

| ID | Blocker | Severity |
|----|---------|----------|
| B1 | **No chargeback/dispute webhook → revoke** — unknown events are ignored; grants survive provider-side reverses | **P0** |
| B2 | **No isolated production payment environment** — must not reuse staging/rehearsal DB, Redis, storage, or secrets | **P0** |
| B3 | **Sandbox settle not proven** — Gate C hosted checkout failed (`processing`, paid ₦0); first live charge would also be first successful webhook/fulfill proof | **P0** (risk) |
| B4 | **Live catalog price is ₦15,000 XRAY_PRO** — unsuitable as an assumed “low-value” live test without an owner-approved alternate price row | **P0** (ops) |
| B5 | **Production key guard incomplete** — forbids `sk_test_` in production but does **not require** `sk_live_`; `KORAPAY_PUBLIC_KEY` prefix unvalidated | **P1** |
| B6 | **`BILLING_WEBHOOK_BASE_URL` optional** — if unset, init omits `notification_url` (dashboard webhook alone is fragile) | **P1** |
| B7 | **No outbound refund API** — refunds only via Korapay dashboard + inbound `refund.success` | **P1** (acceptable for one supervised charge if runbook exists) |
| B8 | **No payment reconciliation job / in-app alerts** — missed webhooks rely on client verify + manual Korapay dashboard | **P1** |
| B9 | **Checkout `expiresAt` stored but not enforced** on verify | **P2** |
| B10 | **Emergency disable stops new checkouts only** — does not revoke existing grants or block entitled downloads | **P2** (mitigate with manual revoke runbook) |

Non-blockers for a supervised single charge (already OK): amount not client-controlled; mock settle unavailable under Korapay; fulfill idempotency; PDF entitlement gate; staging forbids `sk_live_`.

---

## 3. Required implementation changes

Ordered for a **minimum safe path** to one controlled live charge.

### Must land before live activation (P0)

1. **Chargeback / dispute handler**  
   - Extend `BillingWebhooksController` to map Korapay chargeback/dispute success events to a revoke path (reuse or mirror `FulfillmentService.applyRefund`: mark disputed/refunded, revoke `PURCHASE` grants).  
   - Audit unknown billing webhook event types (do not silently drop).  
   - Add integration tests with signed fixtures.

2. **Proven sandbox settle (preferred before live)**  
   - Resolve Korapay hosted test-page issue **or** complete one `sk_test_` success → webhook → fulfill → PDF 200 on rehearsal.  
   - Avoid making the first live charge the first end-to-end proof.

3. **Owner-approved low-value live price**  
   - Add a **production-only** (or time-boxed) catalog price for the controlled test (e.g. ₦100–₦500 minor units — **owner picks amount**).  
   - Do **not** assume seed `XRAY_PRO` ₦15,000.  
   - Prefer a dedicated product/price code (e.g. `XRAY_PRO_LIVE_PROBE`) deactivated immediately after the test, **or** temporary price swap with documented restore.

4. **Isolated production payment stack** (blueprint in §4 — provision only after approval).

### Should land before or with activation (P1)

5. **Tighten env guards** (`apps/api/src/config/env.ts`):  
   - Production + `PAYMENT_PROVIDER=korapay` → require `KORAPAY_SECRET_KEY` starts with `sk_live_`.  
   - Staging → reject `pk_live_` on `KORAPAY_PUBLIC_KEY`; optionally require `pk_test_`.  
   - When `PAYMENT_PROVIDER=korapay`, require `BILLING_WEBHOOK_BASE_URL` (HTTPS).

6. **Controlled-live ops runbook automation hooks** (even if manual):  
   - Document Korapay dashboard refund → expect `refund.success` → verify PDF 403.  
   - Document manual entitlement revoke SQL/API if chargeback arrives before code ships (**not a substitute for B1**).

### Nice-to-have before broader pilot (P2)

7. Enforce `expiresAt` on `verifyAndFulfill`.  
8. Handle `refund.failed` with audit.  
9. Reconciliation job: poll PENDING payments older than N minutes via `verifyTransaction`.  
10. Emergency “block entitled downloads” flag (stronger than checkout-only kill switch).

**Explicitly out of scope for PR-2L:** Increment C, Direct Debit auto-renew, public commercial launch.

---

## 4. Production infrastructure blueprint

**Do not provision yet.** Minimum isolated production payment environment:

```
┌─────────────────────────────────────────────────────────────┐
│  Railway project/environment: production-payments (name TBD) │
│  APP_ENV=production · PAYMENT_PROVIDER=korapay (only after   │
│  owner activation approval)                                  │
├─────────────────────────────────────────────────────────────┤
│  opero-api-prod      HTTPS public                            │
│  opero-web-prod      HTTPS public                            │
│  opero-worker-prod   private                                 │
│  Postgres-prod       private · dedicated volume              │
│  Redis-prod          private · dedicated                     │
│  Object storage-prod private bucket/prefix · no staging keys │
└─────────────────────────────────────────────────────────────┘
```

### Hard isolation rules

| Rule | Requirement |
|------|-------------|
| Compute | Dedicated API + web + worker services (not shared with staging/rehearsal) |
| Data | Dedicated PostgreSQL + Redis — **no** shared connection strings |
| Storage | Dedicated private bucket/prefix; keys never reused from staging |
| Secrets | Production-only `sk_live_` / `pk_live_`, session secrets, S3, DB, Redis, `OPS_STATUS_TOKEN` |
| Webhook | `https://<prod-api-host>/api/v1/billing/webhooks/korapay` registered in **Korapay Live** dashboard **and** `BILLING_WEBHOOK_BASE_URL=https://<prod-api-host>/api/v1` |
| Credentials | Zero staging/rehearsal `sk_test_` / staging DB URLs in production env |
| Financial records | Empty commercial ledger at cutover (or clearly partitioned); no import of staging payments |
| Mock | `PAYMENT_PROVIDER` must not be `mock`; mock settle routes return 404 |
| Registration | `PILOT_MODE=true`, `PUBLIC_REGISTRATION_ENABLED=false`, invite-only owner account |
| Docs | `ENABLE_API_DOCS=false` (or explicit owner exception) |
| Ops | `OPS_STATUS_TOKEN` set; Railway alerts to owner-approved contacts |
| Kill switch | `EMERGENCY_DISABLE_CHECKOUT=true` by default until the controlled window |

### Network / trust

- Webhook endpoint HTTPS only.  
- Production services must not hold staging `DATABASE_URL` / Redis / S3 endpoints.  
- Korapay Live Mode keys only in this environment (never in git, CI logs, or staging).

### Not in this blueprint

- Shared “staging with live keys” — **forbidden** by env policy intent and unsafe.  
- Reusing `korapay-rehearsal` for live money — **forbidden**.

---

## 5. Controlled transaction acceptance plan

### Preconditions (all required)

1. P0 implementation items in §3 complete **or** written owner waiver for B1 with 24/7 watch (not recommended).  
2. Production isolation stack provisioned and health/ready green.  
3. Live webhook URL confirmed in Korapay **Live** dashboard.  
4. Low-value live price approved and active; ₦15,000 XRAY_PRO **not** used unless owner explicitly accepts that amount.  
5. `PUBLIC_REGISTRATION_ENABLED=false`; only owner account.  
6. `EMERGENCY_DISABLE_CHECKOUT` flipped to `false` only for the test window.  
7. Sandbox settle proven **or** owner accepts first-live-is-first-proof risk in writing.

### Transaction shape

| Item | Plan |
|------|------|
| Actor | One owner-controlled account (no external customers) |
| Org | One synthetic / pilot org created in **production** |
| Asset | One synthetic published financial report (PDF in private prod storage) |
| Product | Owner-approved low-value NGN price (not assumed catalog default) |
| Checkouts | **Exactly one** payment reference |
| Instruments | Owner’s real payment method for that single low-value charge |
| Parallel traffic | None |

### Execution steps

1. Preflight: `APP_ENV=production`, `PAYMENT_PROVIDER=korapay`, secret prefix `sk_live_` (confirm via fingerprint/prefix only — never print key), staging still mock / no live keys.  
2. Confirm unpaid PDF → HTTP 403 `ENTITLEMENT_REQUIRED`.  
3. Create **one** checkout; record reference, amount, currency, checkout URL.  
4. Owner completes payment on Korapay hosted live checkout.  
5. Verify: webhook `payment_events` row, `signature_valid=true`, server verify `success`, amount/currency match, payment `SUCCEEDED`, entitlements exactly once, PDF HTTP 200, sibling report (if any) still 403.  
6. Immediately set `EMERGENCY_DISABLE_CHECKOUT=true`.  
7. Reconcile: Korapay Live dashboard amount/reference vs Opero ledger.  
8. **Refund drill (same day):** refund via Korapay Live dashboard → await `refund.success` → payment `REFUNDED` → grants revoked → PDF 403.  
9. Deactivate low-value probe price; leave kill switch on until next approval.

### Reconciliation

| Source | Compare |
|--------|---------|
| Opero `payments.reference` | Korapay Live transaction reference |
| `amount_minor` / `currency` | Korapay amount / currency |
| `status` / `fulfilled_at` | Korapay success + Opero entitlement rows |
| `payment_events` | Webhook delivery + signature |
| After refund | `REFUNDED` + `revoked_at` on grants |

Manual: Korapay dashboard export/screenshot + Opero DB/ops query (no staging).

### Refund / dispute handling for this test

| Event | Action |
|-------|--------|
| Planned refund | Korapay Live dashboard refund → Opero `refund.success` path → confirm PDF locked |
| Unexpected chargeback (if B1 shipped) | Auto-revoke + audit; owner verifies |
| Unexpected chargeback (if B1 waived) | Owner manually revokes grants + disables checkout + Korapay support — **accept residual risk** |

---

## 6. Rollback and emergency-disable procedure

### Immediate kill (minutes)

1. Set `EMERGENCY_DISABLE_CHECKOUT=true` on production API → redeploy/restart as required by Railway var application.  
2. Confirm `GET /api/v1/ops/status` shows `emergency.disableCheckout: true` (with ops token).  
3. Do **not** flip production to `PAYMENT_PROVIDER=mock` (env forbids mock in production; would also break boot).

### If a bad charge already succeeded

1. Kill checkout (above).  
2. Refund in Korapay Live dashboard (triggers `refund.success` revoke when webhook works).  
3. If webhook delayed: manually revoke entitlement grants for that `source_id` / report scope; confirm PDF 403.  
4. Preserve audit rows / `payment_events` — do not delete ledger history.

### Infrastructure rollback

1. Leave production services up but checkout-disabled, **or** scale API/web to zero if under active abuse.  
2. Rotate any secret that may have leaked (never paste live keys into tickets/chat).  
3. Do not point production back at staging DB/Redis/storage.  
4. Korapay Live dashboard: pause/disable API keys only if compromise suspected (owner decision).

### Communication

- Owner is incident owner until a named on-call exists.  
- Wire Railway/uptime alerts to owner-approved contacts before activation (`ops.alertNote` already states in-app recipients are not configured).

---

## 7. Owner approvals required before activation

Sign-off checklist (no activation without these):

| # | Approval |
|---|----------|
| A1 | Accept verdict **NOT READY** until P0 blockers cleared, **or** written waiver of B1/B3 with named residual risks |
| A2 | Approve **production isolation** blueprint and budget/provisioning window (separate from this doc) |
| A3 | Approve **exact low-value NGN amount** for the controlled live charge (not assumed ₦15,000) |
| A4 | Approve loading **live** Korapay credentials into the isolated production env only (keys never in git/chat) |
| A5 | Approve Korapay **Live** dashboard webhook URL = production callback |
| A6 | Approve closed registration (`PILOT_MODE` + `PUBLIC_REGISTRATION_ENABLED=false`) |
| A7 | Approve **one** named owner account as sole payer; no external customers |
| A8 | Approve same-day **refund drill** after success |
| A9 | Approve emergency contacts / Railway alert routing |
| A10 | Explicit authorization to flip `PAYMENT_PROVIDER=korapay` + open checkout window on production (this doc does **not** grant that) |

---

## Phase notes (evidence)

### Phase 1 — Integration review (summary)

- Live/test validation: prod forbids mock + `sk_test_`; staging forbids `sk_live_`; prod does not yet **require** `sk_live_`.  
- Checkout / HMAC / re-verify / amount match / idempotent fulfill: implemented.  
- Refund inbound revoke: implemented for `PURCHASE`.  
- Chargeback revoke / outbound refund API / reconciliation job: gaps.  
- Primary files: `packages/payments/src/providers/korapay.ts`, `apps/api/src/billing/{checkout,fulfillment,webhooks}.*.ts`, `apps/api/src/config/env.ts`.

### Phase 2 — Production isolation

Blueprint only (§4). Not provisioned.

### Phase 3 — Operational safety

| Area | Today |
|------|-------|
| Payment failure alerts | External monitors only |
| Webhook monitoring | Logs + `payment_events`; no dedicated pager |
| Incident ownership | Owner (unnamed on-call) |
| Emergency checkout disable | `EMERGENCY_DISABLE_CHECKOUT` |
| Backups | Railway volume/DB backup posture must be confirmed at provision time |
| Audit logs | `billing.*` audit actions + `payment_events` |
| Manual reconciliation | Dashboard + DB (§5) |
| Refund/dispute procedures | Dashboard refund; chargeback code gap |

### Phase 4 — Controlled live plan

See §5. Synthetic report, one reference, closed registration, owner-approved low value, refund drill.

### Phase 5 — Security

| Check | Result |
|-------|--------|
| Live keys in source/logs | Must not appear; verify at provision with secret scanning / log redaction review |
| Prod rejects mock settlement | Yes (`resolveAppEnv===production` or provider≠mock → 404) |
| Client cannot modify amount | Yes (catalog price) |
| Entitlement before verified settlement | No (fulfill requires verify success + match + lock) |
| Cross-tenant enforcement | Yes |
| Prod cannot access staging data stores | **Design requirement** — enforce at provision; not auto-proven until env audit |

---

## Safest next actions (for owner)

1. Decide: clear **B1 (chargeback)** + prefer **B3 (sandbox settle)** before any live charge.  
2. Separately authorize production isolation provisioning (not in this task).  
3. Choose and approve the **low-value NGN** live probe amount.  
4. Keep shared staging on **mock**; keep rehearsal on **test** keys only.  
5. Do **not** change `PAYMENT_PROVIDER`, deploy, or charge until A1–A10 are signed.

**Stopped for owner review.**
