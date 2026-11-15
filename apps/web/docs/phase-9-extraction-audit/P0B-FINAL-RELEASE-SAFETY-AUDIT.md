# P0-B Final Release Safety Audit

**Status:** COMPLETE — awaiting owner approval to push/deploy  
**Date:** 2026-11-15  
**Reviewed commit:** `cc7041f` (`fix(billing): enable secure staging mock settlement for PDF entitlement`)  
**Parent / current staging baseline:** `d301cb3`  
**Security subagent:** no medium / high / critical findings  

**Constraints honored:** no push, no Railway deploy, no production changes, Increment C not started, no financial-data or customer-report mutation.

---

## Security verdict

**APPROVE for staging release** of `cc7041f` under the configuration below.

Mock settlement cannot activate under ordinary production configuration. Settlement and PDF unlock reuse the existing entitlement path (no bypass). Authorization, org scoping, amount/currency checks, and idempotent fulfillment hold.

**Required corrections before staging:** none.

**Optional post-staging hygiene (non-blocking):**
1. Mock-only: after a successful fulfill, a later authorized `outcome: "failed"` can mark payment FAILED in bookkeeping without revoking grants (requires `billing:manage` + mock provider). Staging integrity only.
2. Multi-replica staging: in-memory mock charges are per API process; settle on a cold replica fails closed (`MOCK_CHARGE_UNKNOWN`). Prefer single API replica or sticky settle→verify on the same instance during smoke.

---

## 1. Mock settlement isolation

| Check | Result | Evidence |
|-------|--------|----------|
| Unavailable in production | **PASS** | Boot rejects `PAYMENT_PROVIDER=mock` when resolved app env is production (`env.ts`). Live probe: missing `APP_ENV` + `NODE_ENV=production` + mock → **REJECT**. |
| Unavailable with non-mock provider | **PASS** | `mockSettleAndFulfill` requires `payments.name === "mock"` **and** `instanceof MockKorapayProvider`; else `NotFoundException` (404). Unit test covered. |
| Missing / ambiguous `APP_ENV` fails closed | **PASS** | Missing `APP_ENV` with `NODE_ENV=production` → production rules. Invalid `APP_ENV` (e.g. `prod`) → zod reject at boot. |
| Missing / ambiguous `PAYMENT_PROVIDER` fails closed | **PASS** | Schema default is `mock`, but production boot then rejects mock. Invalid values (e.g. `paystack`) → zod reject. Missing provider + `NODE_ENV=production` → **REJECT**. |
| Accidental production activation | **PASS** | Ordinary production needs `PAYMENT_PROVIDER=korapay` (or boot fails). With korapay, endpoint is 404 even if somehow called. |
| No public unauthenticated settle | **PASS** | Endpoint uses `SessionAuthGuard` + `OrgMembershipGuard` + `PermissionsGuard` + `billing:manage` + throttle. `mock-pay` page is UI only; mutates via CSRF-protected authenticated API. Webhooks still signature-verified and re-verify provider status. |

---

## 2. Authorization

| Check | Result |
|-------|--------|
| `billing:manage` required | **PASS** (viewer settle → 403) |
| Org membership enforced | **PASS** |
| Cross-tenant reference settle | **PASS** (org-scoped payment lookup → 404) |
| Report entitlements org-scoped | **PASS** (grants keyed by `organizationId` + REPORT `scopeId`) |
| Client cannot set amount/currency/product | **PASS** (settle body: `reference` + `outcome` only; price from catalog at checkout; verify re-checks provider amount/currency) |
| Unauthorized denial codes | **PASS** (403 permission / 404 not found or cross-tenant) |

---

## 3. Payment integrity

| Check | Result |
|-------|--------|
| Idempotent settlement | **PASS** (`ALREADY_FULFILLED` on replay; grant upsert by `sourceId: payment.id`) |
| Concurrent double-grant prevented | **PASS** (`fulfillmentLock` + existing concurrent verify test) |
| Failed/cancelled without authorized success | **PASS** (non-success verify → FAILED, no grants; abandoned does not settle) |
| Amount + currency must match checkout | **PASS** (`CURRENCY_MISMATCH` / `AMOUNT_MISMATCH` before success) |
| Atomic / safely retryable fulfill | **PASS** (DB transaction + lock; retry converges to `ALREADY_FULFILLED`) |
| Audit preserved | **PASS** (`billing.mock_settled`, `billing.payment_verified`, `billing.payment_fulfilled`; no secrets/storage keys) |

---

## 4. PDF authorization

| Check | Result |
|-------|--------|
| Unpaid → `ENTITLEMENT_REQUIRED` | **PASS** |
| Settled unlocks purchased report only | **PASS** (REPORT-scoped `xray.pdf_download` / `xray.full_report`) |
| Other reports remain locked | **PASS** (scopeId must match; no org-wide X-Ray Pro grant from report checkout) |
| Cross-tenant denied | **PASS** (outsider PDF → 404) |
| R2 private | **PASS** (API streams after authz; storage key must start with `org/{orgId}/reports/{reportId}/`; no public object URL in responses) |
| Historical non-verified disclosures | **PASS** (P0-A read-time `publicationForPresentation` demotion unchanged; download does not alter integrity presentation contracts) |

---

## 5. Deployment compatibility

### Required Railway services
- **opero-api** — required (mock-settle + checkout URL rewrite)
- **opero-web** — required (mock-pay page + unlock/billing messaging)
- **opero-worker** — **not required** for P0-B behavior (no worker code in `cc7041f`)
- Postgres / Redis / R2 — unchanged

### Environment configuration (staging API)

| Variable | Expected | Verify |
|----------|----------|--------|
| `APP_ENV` | `staging` | Must be set so `NODE_ENV=production` runtime does not treat env as live production |
| `PAYMENT_PROVIDER` | `mock` | Enables mock settle; production forbids this |
| `APP_ORIGIN` | Staging web HTTPS origin | Builds `/billing/mock-pay` checkout URLs |
| `CORS_ORIGINS` | Includes staging web origin | Session cookies / browser calls |
| Korapay keys | Not required while mock | Do not set `sk_live_` on staging |

Production (do not touch): `APP_ENV=production` (or unset with `NODE_ENV=production`) + `PAYMENT_PROVIDER=korapay` + live keys.

### Migrations
**None.**

### Worker redeploy
**Optional / not required** for P0-B. Leave worker on `d301cb3` (`a0d84580-…`) unless image alignment is desired.

### Rollback deployment IDs (current staging @ `d301cb3`)

| Service | Deployment ID | Commit |
|---------|---------------|--------|
| API | `c64e90c0-26b2-484b-919d-c82fb50decca` | `d301cb3` |
| Worker | `a0d84580-eb31-4d64-a47e-1265881f13e1` | `d301cb3` |
| Web | `21335127-f48f-45e1-9369-e5267c5b0c98` | `d301cb3` |

### GitHub watch-pattern behavior
Historically staging services use Railway GitHub auto-deploy with path filters. P0-B touches:
- `apps/api/**` → should trigger **opero-api**
- `apps/web/**` → should trigger **opero-web**
- No `apps/worker/**` → worker should **not** need a deploy

**Pre-push gate (owner):** confirm current `watchPatterns` still include `apps/api/**` (+ Dockerfile.api) and `apps/web/**` (+ Dockerfile.web). If API patterns are too narrow (or empty and relying on full-repo), ensure API actually deploys for this commit; do not rely on empty-commit tricks without verifying watch filters.

### Safe deployment order
1. Confirm staging env vars (`APP_ENV=staging`, `PAYMENT_PROVIDER=mock`, `APP_ORIGIN`).
2. Push `cc7041f` only after approval (or manual deploy from that commit).
3. Deploy / wait for **opero-api** healthy (`/api/v1/health`).
4. Deploy / wait for **opero-web** healthy (`/health`).
5. Do **not** deploy worker unless aligning images.
6. Smoke (synthetic org only): unpaid PDF 403 → checkout → mock-pay success → entitled PDF 200; failed settle stays locked; cross-org denied.

---

## 6. Validation results

| Suite | Result |
|-------|--------|
| Billing mock-settle + integration + env + phase6b integrity | **41 passed** (4 files) |
| `@opero/payments` | **9 passed** |
| `@opero/web` vitest | **78 passed** |
| API `tsc --noEmit` | **clean** |
| Web `tsc --noEmit` | **clean** |
| Env fail-closed live probe | **7/7 expected reject/OK** |
| Docker `opero-api:p0b-audit` | **PASS** |
| Docker `opero-web:p0b-audit` | **PASS** |

(Worker image unchanged for this audit; previously built clean for P0-B.)

---

## 7. Rollback plan

1. Redeploy API → prior `c64e90c0-…` @ `d301cb3`.
2. Redeploy web → prior `21335127-…` @ `d301cb3`.
3. Leave worker on `a0d84580-…` (unchanged).
4. No migration reverse.
5. Any staging mock-granted entitlements remain until revoked via existing refund/revoke tooling if cleanup is needed.

---

## Stop

Awaiting owner approval. **Do not push. Do not deploy. Do not modify production. Do not begin Increment C.**
