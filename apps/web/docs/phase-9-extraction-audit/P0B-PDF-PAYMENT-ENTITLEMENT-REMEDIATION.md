# P0-B PDF Payment Entitlement Remediation

**Status:** Implemented locally — awaiting owner review (no push / no deploy / no production / Increment C not started)  
**Date:** 2026-11-15  
**Base:** commit `d301cb3` (P0-A staging acceptance passed)

---

## 1. Root cause

Previous synthetic E2E could create checkout and generate/store the PDF, but customer download returned **403 `ENTITLEMENT_REQUIRED`** because mock settlement was unreachable end-to-end.

| Factor | Detail |
|--------|--------|
| Mock provider | `MockKorapayProvider` keeps charges **in-process memory**. Checkout left the charge `pending`. |
| Verify path | `POST …/payments/verify` only calls `verifyTransaction` + fulfill. Pending mock charges never become `success`, so fulfillment stays `FAILED` / not fulfilled. |
| Webhook path | Korapay-style webhook requires a valid signature. Unsigned/forged callbacks are rejected; there was no authenticated staging settle that mutates the mock charge then verifies. |
| Checkout URL | Provider returned a non-browser mock URL; there was no web journey that settled the charge under session + `billing:manage`. |
| Entitlement system | Working as designed — PDF download correctly required `xray.pdf_download` REPORT-scoped grant. The gap was settlement, not entitlement bypass. |

**Transaction state machine (unchanged core; mock settle feeds the same path):**

```
CheckoutIntent: CREATED → (provider init) → OPEN
Payment:        PENDING → verify
                  ├─ provider success + amount/currency match → SUCCEEDED + fulfill lock
                  │     → entitlement grants (xray.full_report, xray.pdf_download)
                  │     → purchase/subscription records
                  │     → FULFILLED | ALREADY_FULFILLED (idempotent)
                  ├─ provider failed / abandoned / pending → FAILED (no grants)
                  └─ amount or currency mismatch → FAILED (no grants)

Refund / revoke path (existing): applyRefund → revoke grants (revokedAt set)
```

Mock staging addition:

```
Authenticated POST …/payments/mock-settle { reference, outcome }
  → 404 unless live PaymentProvider.name === "mock"
  → org-scoped payment lookup
  → MockKorapayProvider.settle(reference, outcome)
  → audit billing.mock_settled
  → same verifyAndFulfill as production redirect/webhook verify
```

---

## 2. Files changed

| File | Change |
|------|--------|
| `apps/api/src/billing/checkout.service.ts` | `mockSettleAndFulfill`; mock checkout URL → web `/billing/mock-pay`; `mockSettlementAvailable` flag |
| `apps/api/src/billing/billing.controller.ts` | `POST …/payments/mock-settle` (session + org + `billing:manage` + throttle) |
| `apps/api/src/billing/checkout.mock-settle.test.ts` | Unit: non-mock → 404; unknown charge → no fulfill |
| `apps/api/src/billing/billing.integration.test.ts` | E2E: unpaid PDF 403; authz; wrong ref; failed settle; success; idempotent replay; cross-tenant 404; audit hygiene |
| `apps/web/src/app/organizations/[orgId]/billing/mock-pay/page.tsx` | Staging mock pay UI (success / fail / cancel) |
| `apps/web/src/app/organizations/[orgId]/billing/page.tsx` | Pending / success / failure messaging; reload entitlements after verify |
| `apps/web/src/app/organizations/[orgId]/reports/[reportId]/page.tsx` | Payment-required / `ENTITLEMENT_REQUIRED` unlock CTA |
| `apps/web/src/app/organizations/[orgId]/reports/[reportId]/unlock/page.tsx` | Checkout → mock-pay when available |
| `apps/web/src/lib/api.ts` | `apiDownload` surfaces error `code` |
| `apps/web/docs/phase-9-extraction-audit/P0B-PDF-PAYMENT-ENTITLEMENT-REMEDIATION.md` | This delivery report |

**Not changed:** P0-A financial-integrity contracts, entitlement grant codes/scopes, R2 private access model, production Korapay webhook verify path.

---

## 3. Settlement and entitlement state machine

1. **Checkout** creates unique `paymentReference` (`opero_<uuid>`), org/user/report-bound `CheckoutIntent` + `Payment` (PENDING), expected `amountMinor`/`currency` from catalog `XRAY_PRO`.
2. **Mock settle (staging only)** requires session membership + `billing:manage`, org-matching reference, and live `PAYMENT_PROVIDER=mock`. Outcomes: `success` | `failed` | `abandoned`.
3. **Verify** always re-reads provider status; amount and currency must match checkout or payment → FAILED.
4. **Fulfill** uses exclusive `fulfillmentLock`; concurrent/duplicate verify → `ALREADY_FULFILLED`; grants exactly `XRAY_PRO_ENTITLEMENTS` scoped to organization + report (`scopeId`).
5. **PDF download** checks `xray.pdf_download` entitlement; unpaid → 403 `ENTITLEMENT_REQUIRED`; revoked/expired grants denied; cross-tenant → 404; R2 objects remain private (API streams after authz).

---

## 4. Security controls

1. Mock settle **unavailable** when provider ≠ mock (`NotFoundException` — no bypass advertisement).
2. Production env validation: `PAYMENT_PROVIDER=mock` **forbidden** when `APP_ENV`/`NODE_ENV` resolves to production (`apps/api/src/config/env.ts`).
3. AuthN/AuthZ: `SessionAuthGuard` + `OrgMembershipGuard` + `PermissionsGuard` (`billing:manage`); CSRF on mutating web calls.
4. Reference uniqueness + org association on lookup; cross-org settle → 404.
5. Idempotent fulfill lock; duplicate settle does not duplicate entitlement rows beyond the two X-Ray Pro codes.
6. Failed/cancelled/pending → no unlock.
7. Amount + currency match required before SUCCEEDED.
8. Grants scoped to org + report; outsider PDF → 404.
9. Audit: `billing.mock_settled`, `billing.payment_verified`, `billing.payment_fulfilled` — no secrets, tokens, or storage keys in audit/response assertions.
10. No publicly accessible settlement bypass; mock-pay page only calls authenticated API.

---

## 5. Test results

| Suite | Result |
|-------|--------|
| API billing + payments + reports (`vitest`) | **37 passed** (6 files) |
| `checkout.mock-settle.test.ts` + billing integration (incl. mock-settle PDF path) | **12 passed** in focused re-run |
| `@opero/payments` | **9 passed** |
| `@opero/reports` | **61 passed** |
| `@opero/web` | **78 passed** (16 files) |
| API `tsc --noEmit` | **clean** |
| Web `tsc --noEmit` | **clean** |
| Docker `Dockerfile.api` → `opero-api:p0b` | **PASS** |
| Docker `Dockerfile.web` → `opero-web:p0b` | **PASS** |
| Docker `Dockerfile.worker` → `opero-worker:p0b` | **PASS** |

Covered scenarios: successful mock settle; duplicate settle → `ALREADY_FULFILLED`; wrong reference; failed payment (no unlock); unauthorized settle (viewer 403); cross-tenant settle/download denied; unpaid PDF 403; paid PDF 200; production/non-mock mock-settle rejection (404); env forbids mock in production (existing env tests).

---

## 6. Database migration requirements

**None.** Uses existing `Payment`, `CheckoutIntent`, `EntitlementGrant`, and `AuditEvent` tables. No schema changes.

---

## 7. Environment variable requirements

| Variable | Staging expectation | Notes |
|----------|---------------------|-------|
| `PAYMENT_PROVIDER` | `mock` | Enables mock settle + mock-pay checkout URL |
| `APP_ENV` | `staging` | Allows mock while `NODE_ENV=production` runtime is OK |
| `APP_ORIGIN` | Staging web origin | Builds mock-pay checkout URLs |
| `BILLING_WEBHOOK_BASE_URL` | optional | Unused for mock settle path |
| Korapay keys | not required when provider=mock | Required only for `korapay` |

Production must keep `PAYMENT_PROVIDER=korapay` (or non-mock); mock is rejected at boot.

---

## 8. Staging deployment sequence (owner-authorized later)

**Do not execute until owner approves push/deploy.**

1. Push commit after review (not done in this increment).
2. Deploy **API** first (mock-settle endpoint + checkout URL rewrite).
3. Deploy **web** (mock-pay page + unlock/billing/report messaging).
4. Worker unchanged for P0-B behavior; redeploy only if image alignment required.
5. Confirm staging `PAYMENT_PROVIDER=mock`, `APP_ENV=staging`, `APP_ORIGIN` correct.
6. Smoke: unpaid PDF → 403; checkout → mock-pay → success settle → entitled PDF download; failed settle → still locked.

---

## 9. Rollback strategy

1. Revert this commit on API/web (or redeploy prior image `@ d301cb3`).
2. Mock-settle endpoint disappears; entitlement + PDF authz remain as before (locked until real provider fulfillment).
3. No DB migration to reverse.
4. In-flight SUCCEEDED payments/grants from staging tests remain; revoke manually if needed via existing refund/revoke tooling.

---

## 10. Stop conditions honored

- Local commit only (after this report).
- No GitHub push.
- No Railway deploy.
- No production changes.
- Increment C not started.
- P0-A integrity contracts untouched.
- Entitlement system not bypassed.
