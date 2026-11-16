# PR-2L-B A12-P3-R2 — Concurrent live-pilot payment-attempt hardening

**Date:** 2026-11-16  
**Mode:** Local implement + test only  
**Parent:** `PR2L-B-A12-P3-RELEASE-SECURITY-AUDIT.md` (residual **R2**)  
**Base commit:** `31749a375ae5d7a89a66fc6dba05636988429ce3`

### Restrictions honored

- No push / deploy / production migrate  
- No production config / fixtures  
- Checkout / registration / uploads not enabled  
- No Korapay charges / webhook sends  
- Staging / rehearsal untouched  
- Increment C not started  

---

## Executive verdict

### **PASS — R2 closed locally**

Concurrent live-pilot checkout requests can no longer double-call the payment provider before intent persistence. Reservation is committed under a serialized DB transaction (advisory lock + partial unique index) **before** any Korapay `initializeCheckout`.

| Gate | Verdict |
|------|---------|
| Check-then-insert race eliminated | **PASS** |
| At most one provider initiation (2-way / 10-way) | **PASS** |
| Controlled conflict for competitors (`409 LIVE_PILOT_ATTEMPT_IN_PROGRESS`) | **PASS** |
| Ambiguous timeout does not release reservation | **PASS** |
| Definite init failure releases safely | **PASS** |
| Kill switch / `LIVE_PILOT_ENABLED=false` precedence | **PASS** |
| No entitlement before verified settlement | **PASS** |
| Normal XRAY_PRO ₦15,000 path unchanged | **PASS** |
| Local typecheck / build / migrate | **PASS** |

**STOP FOR OWNER REVIEW** — do not deploy, arm pilot flags, or open a charge window.

---

## 1. Root cause

`CheckoutService.startLivePilotCheckout` performed an application-level pending check **outside** any transaction, then called Korapay, then inserted `checkout_intent` + `payment`.

With **distinct idempotency keys**, concurrent requests both observed “no pending attempt,” both called `initializeCheckout`, then both inserted rows. Uniques on `idempotency_key` / `payment_reference` did not collide across keys, so the provider could be initiated twice for the same allowlisted org/report.

```
A: pending? → none
B: pending? → none
A: Korapay initialize   ← charge #1
B: Korapay initialize   ← charge #2 (R2)
A/B: insert intents
```

Serial second attempts were already blocked (`LIVE_PILOT_ATTEMPT_IN_PROGRESS`); only the concurrent window was open.

---

## 2. Fix

### Reservation-before-provider

`startLivePilotCheckout` now:

1. Applies existing gates (kill switch → `LIVE_PILOT_*` allowlist → report tenancy).  
2. Resolves probe price (₦100) server-side.  
3. Opens a short `$transaction`:  
   - `pg_advisory_xact_lock(hashtext('live-pilot:' || orgId || ':' || reportId))`  
   - Re-check same-key idempotency (safe concurrent replay)  
   - Re-check success cap  
   - Expire TTL-elapsed active attempts (`EXPIRED` + payment `CANCELLED`)  
   - Re-check active pending attempt → `409 LIVE_PILOT_ATTEMPT_IN_PROGRESS`  
   - **Insert** intent `CREATED` + payment `PENDING` with the reserved `payment_reference`  
4. **Commits** (releases the xact lock).  
5. Calls provider `initializeCheckout` with the reserved reference.  
6. On success → update intent to `REDIRECTED` + `checkoutUrl`.  

Competing requests never reach Korapay once a reservation row exists.

### Database enforcement

Migration `20261116170000_a12_live_pilot_active_attempt_guard`:

```sql
CREATE UNIQUE INDEX checkout_intents_live_pilot_active_attempt_uidx
ON checkout_intents (organization_id, report_id)
WHERE product_code = 'XRAY_PRO_LIVE_PROBE'
  AND report_id IS NOT NULL
  AND status IN ('CREATED', 'REDIRECTED', 'PENDING_PAYMENT');
```

`P2002` on insert maps to the same controlled conflict response.

### Provider failure policy

| Outcome | Reservation | Next attempt |
|---------|-------------|--------------|
| Definite init rejection (`PaymentInitError` kind=`definite`, e.g. 4xx) | Mark intent `FAILED`, payment `FAILED` | Allowed |
| Ambiguous / timeout / 5xx / network (`kind=ambiguous`) | **Keep** `CREATED` + `PENDING` | Blocked (`409`) until TTL expiry or ops terminalization |
| Session TTL elapsed | `EXPIRED` + payment `CANCELLED` inside lock | Allowed |
| Idempotent same-key retry | Replay existing intent | No second provider call |
| Later verified success | Existing fulfill CAS + `LIVE_PILOT_MAX_SUCCESSES` | No duplicate entitlements |

**Never** release solely because the provider response is ambiguous.

Typed errors live in `@opero/payments` (`PaymentInitError`); Korapay maps network/5xx → ambiguous, 4xx/clear reject → definite.

---

## 3. Concurrency-test results

Suite: `apps/api/src/billing/a12-live-pilot-concurrency.integration.test.ts`  
(instrumented mock provider counts `initializeCheckout` calls)

| Check | Result |
|-------|--------|
| Two simultaneous distinct-key requests → ≤1 provider init; statuses `{201,409}` | **PASS** |
| Ten simultaneous distinct-key requests → exactly 1×201 + 9×409; initCalls=1 | **PASS** |
| Competing conflict body `LIVE_PILOT_ATTEMPT_IN_PROGRESS` | **PASS** |
| Same-key concurrent idempotent retries → one reference; initCalls=1 | **PASS** |
| Definite failure releases; retry can initiate once | **PASS** |
| Ambiguous timeout holds reservation; competitor initCalls=0 | **PASS** |
| Cross-tenant denied | **PASS** |
| `EMERGENCY_DISABLE_CHECKOUT` precedes; initCalls=0 | **PASS** |
| `LIVE_PILOT_ENABLED=false`; initCalls=0 | **PASS** |
| No entitlement grants before settlement | **PASS** |

Existing `a12-live-pilot-pricing.integration.test.ts` updated: serial in-progress now expects **409**.

---

## 4. Migration requirements

| Item | Detail |
|------|--------|
| Identifier | `20261116170000_a12_live_pilot_active_attempt_guard` |
| Change | Additive partial unique index only |
| Destructive? | **No** |
| Touches XRAY_PRO? | **No** |
| Local status | Applied to local `opero` and `opero_test`; `prisma migrate status` → up to date (14 migrations) |
| Production | **Do not apply** until owner-authorized deploy of this RC |
| Rollback | Drop index only if needed: `DROP INDEX IF EXISTS checkout_intents_live_pilot_active_attempt_uidx;` — no table/data DROP. Feature remains safe with flags off even if index remains. |

Deploy order when authorized: migrate → API release with `LIVE_PILOT_ENABLED=false` and `EMERGENCY_DISABLE_CHECKOUT=true`.

---

## 5. Validation (local, 2026-11-16)

| Check | Result |
|-------|--------|
| Targeted suite (concurrency + live-pilot pricing + billing + pilot invite/controls + security + concurrent-owner + env) | **8 files / 72 tests PASS** |
| Broader API vitest pass during development | **33 files / 160 tests PASS** |
| `@opero/payments` unit (incl. init-error classification) | **PASS** |
| `prisma validate` | **PASS** |
| `prisma migrate status` (`opero_test`) | **up to date** |
| `@opero/api` typecheck | **PASS** |
| `@opero/api` build | **PASS** |

---

## 6. Remaining risks

| ID | Severity | Risk | Notes |
|----|----------|------|-------|
| R2-a | Low | After checkout TTL, an ambiguous first init that actually succeeded at Korapay could allow a second reservation | Mitigated by `LIVE_PILOT_MAX_SUCCESSES`, fulfill uniqueness, ops verify-before-retry; document in live-window runbook |
| R2-b | Low | Public `startXrayProCheckout` still uses provider-before-insert | Out of R2 scope; normal pricing path unchanged; not allowlisted single-attempt pilot |
| R1 / R3–R5 | Prior | Unchanged from A12-P3 audit | Still non-blocking for prep |
| Process | — | RC still uncommitted | Owner authorize commit before any deploy |

---

## 7. Updated release candidate

**Base:** `31749a375ae5d7a89a66fc6dba05636988429ce3`

### R2 delta (this hardening)

**Modified**

- `apps/api/src/billing/checkout.service.ts` — reserve-before-provider  
- `apps/api/src/billing/a12-live-pilot-pricing.integration.test.ts` — expect 409  
- `apps/api/src/testing/app-factory.ts` — optional `paymentProvider` override  
- `packages/database/prisma/schema.prisma` — comment on partial unique  
- `packages/payments/src/providers/korapay.ts` — typed init errors  
- `packages/payments/src/providers/korapay.test.ts`  
- `packages/payments/src/index.ts`

**Added**

- `packages/database/prisma/migrations/20261116170000_a12_live_pilot_active_attempt_guard/migration.sql`  
- `packages/payments/src/providers/init-errors.ts`  
- `apps/api/src/billing/a12-live-pilot-concurrency.integration.test.ts`  
- this report

### Combined A12 P1/P2/P3-R2 RC (still uncommitted)

Includes prior P1/P2 files from the A12-P3 audit plus the R2 delta above.  
**Do not** bundle unrelated untracked docs under `apps/web/docs/phase-9-extraction-audit/` except the A12 reports.

Proposed commit message (owner-authorized only):

```
fix(billing): serialize live-pilot payment initiation before Korapay

Reserve one active XRAY_PRO_LIVE_PROBE attempt per org/report under an
advisory lock and partial unique index so concurrent requests cannot
double-initiate checkout.
```

---

## 8. Owner decision gate

| Option | Meaning |
|--------|---------|
| **A — Accept R2 close** | Include R2 migration + code in next authorized prep commit/deploy (flags still off) |
| **B — Defer index** | Keep app-level advisory reservation only (not recommended) |
| **C — Hold** | Leave uncommitted until charge-window planning |

**Recommendation:** **A**, then keep `LIVE_PILOT_ENABLED=false` / `EMERGENCY_DISABLE_CHECKOUT=true` until Authorize C.

### STOP FOR OWNER REVIEW

No further Increment C / live charge / production migrate work without explicit authorization.
