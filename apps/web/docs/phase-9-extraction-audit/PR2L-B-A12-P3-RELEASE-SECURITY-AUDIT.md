# PR-2L-B A12-P3 — Pilot onboarding & pricing release security audit

**Date:** 2026-11-16  
**Mode:** READ-ONLY audit + local regression only  
**Base commit (production HEAD):** `31749a375ae5d7a89a66fc6dba05636988429ce3`  
**Parents:** `PR2L-B-A12-P1-P2-SECURE-LIVE-PILOT-IMPLEMENTATION.md`, `PR2L-B-A12-KORAPAY-LIVE-READINESS-AUDIT.md`, `PR2L-B-A12-P-LIVE-PILOT-PREPARATION.md`

### Restrictions honored

- No push / deploy  
- No production variable changes  
- No production fixtures / accounts  
- Checkout / registration / uploads **not** enabled  
- No Korapay charges / webhook sends  
- Staging / rehearsal untouched  
- Increment C not started  
- Secret values not printed  

---

## Executive verdict

### **PASS — dormant P1/P2 code is release-ready for prep deploy**  
### **BLOCKED — live payment window / Korapay settle rehearsal**

| Gate | Verdict |
|------|---------|
| Invitation security (code + local tests) | **PASS** |
| Hidden ₦100 pricing + kill-switch precedence | **PASS** |
| Migration additive safety | **PASS** |
| Default-off production behavior | **PASS** |
| Local regression (typecheck/build/tests) | **PASS** |
| Commit exists on remote | **N/A** — changes are **uncommitted** local working tree |
| Live Korapay charge / Authorize C–D | **BLOCKED** (inherited A12 blockers) |

**No critical security findings** that block a **prep release** with `LIVE_PILOT_ENABLED=false` and `EMERGENCY_DISABLE_CHECKOUT=true`.  
**Do not** open a live charge window until §8 Korapay blockers are cleared or waived in writing.

---

## 1. Source and migration audit

### Git status

| Item | Value |
|------|-------|
| Branch | `main` |
| HEAD | `31749a3` — `fix(billing): harden dispute CAS so late fulfill cannot restore access` |
| A12-P1/P2 | **Uncommitted** working-tree changes (not a SHA yet) |

### Exact release-candidate file set

**Modified (10)**

- `apps/api/src/app.module.ts`
- `apps/api/src/auth/csrf.middleware.ts`
- `apps/api/src/billing/billing.controller.ts`
- `apps/api/src/billing/catalog.service.ts`
- `apps/api/src/billing/checkout.service.ts`
- `apps/api/src/config/env.ts`
- `apps/api/src/config/env.test.ts`
- `apps/api/src/testing/phase6-fixtures.ts`
- `packages/database/prisma/schema.prisma`
- `packages/shared/src/index.ts`

**Added (implementation + tests + docs)**

- `apps/api/src/pilot/pilot.module.ts`
- `apps/api/src/pilot/pilot-invitation.service.ts`
- `apps/api/src/pilot/pilot-invitation.controller.ts`
- `apps/api/src/pilot/pilot-ops.controller.ts`
- `apps/api/src/pilot/a12-pilot-invite.integration.test.ts`
- `apps/api/src/billing/a12-live-pilot-pricing.integration.test.ts`
- `packages/database/prisma/migrations/20261116140000_a12_pilot_invite_and_probe_price/migration.sql`
- `apps/web/docs/phase-9-extraction-audit/PR2L-B-A12-P1-P2-SECURE-LIVE-PILOT-IMPLEMENTATION.md`
- this audit: `PR2L-B-A12-P3-RELEASE-SECURITY-AUDIT.md`

### Migration identifier

`20261116140000_a12_pilot_invite_and_probe_price`

| Operation | Destructive? | Notes |
|-----------|--------------|-------|
| `CREATE TABLE pilot_bootstrap_invitations` | No | New table + indexes + optional FKs `ON DELETE SET NULL` |
| `INSERT` probe product/price | No | Fixed UUIDs; **does not** update `XRAY_PRO.NGN` (₦15,000 / `1500000`) |
| ALTER existing payment/user rows | No | None |

**Rehearsal/production safety:** Additive only. Depends on existing pricing version id `11111111-1111-4111-8111-111111111111` from phase-7a seed (present in current lineage). Fail-closed if that version is missing. No DROP/UPDATE/DELETE.

**Local migrate status (`opero_test`):** schema up to date (13 migrations).

### Routes and authorization

| Route | AuthZ | Default effect in prod (flags off) |
|-------|-------|-------------------------------------|
| `POST /ops/pilot-invitations` | `OPS_STATUS_TOKEN` (timing-safe) | 401 without token; 503 if token unset |
| `POST /ops/pilot-invitations/:id/revoke` | `OPS_STATUS_TOKEN` | Same |
| `POST /auth/pilot-invitations/accept` | Single-use invite token | Works only with valid hashed invite |
| `POST …/billing/checkout/live-pilot` | Session + org membership + `billing:manage` | **400 `LIVE_PILOT_DISABLED`** when `LIVE_PILOT_ENABLED=false`; kill switch still first |

### Environment variables (new / relevant)

| Var | Default | Production posture for prep |
|-----|---------|------------------------------|
| `LIVE_PILOT_ENABLED` | **false** | Keep false |
| `LIVE_PILOT_EXPIRES_AT` | unset | Required only when enabling |
| `LIVE_PILOT_ORG_ID` / `REPORT_ID` | unset | Required only when enabling |
| `LIVE_PILOT_MAX_SUCCESSES` | 1 | Keep 1 |
| `PILOT_BOOTSTRAP_INVITE_TTL_HOURS` | 72 | OK |
| `OPS_STATUS_TOKEN` | optional | **Must be set** to issue invites |
| `EMERGENCY_DISABLE_CHECKOUT` | false in schema; **true in prod ops** | Keep true until Authorize C |
| `PUBLIC_REGISTRATION_ENABLED` | true in schema; **false required** when `PILOT_MODE` + production | Keep false |

### Seed / pricing

- Public catalog filters out `XRAY_PRO_LIVE_PROBE`.
- `requireActivePriceByProductCode("XRAY_PRO_LIVE_PROBE")` → NotFound.
- Probe amount enforced as `LIVE_PILOT_AMOUNT_MINOR = 10000` (₦100) server-side.
- `XRAY_PRO.NGN` remains `1500000` (₦15,000) — unchanged by migration.

---

## 2. Invitation security

| Check | Result | Evidence |
|-------|--------|----------|
| Ops token not in web/browser app | **PASS** | No `OPS_STATUS_TOKEN` / `pilot-invitations` references under `apps/web` |
| Unauthorized issue rejected | **PASS** | Missing/wrong token → 401; tests |
| Secure generation | **PASS** | `randomBytes(32)` → base64url (`generateOpaqueToken`) |
| Stored hashed | **PASS** | SHA-256 hex `tokenHash` only in DB; raw returned once to ops |
| Single-use | **PASS** | `updateMany` where `consumedAt=null`; reuse → `PILOT_INVITE_INVALID` |
| Expiry / revoke | **PASS** | Tests for expired + revoked |
| Concurrent accept atomicity | **PASS*** | Transaction + CAS `updateMany`; email uniqueness prevents double user. *No `SELECT FOR UPDATE` on invite row — residual R1* |
| Password rules | **PASS** | Zod `password.min(12)`; weak password rejected |
| Email verification model | **PASS*** | Sets `emailVerifiedAt` on accept (same as org invitations). *Not a separate verify-email hop — by design* |
| Tenant isolation | **PASS** | New org + OWNER only; cross-tenant GET denied (404) |
| Privilege escalation | **PASS** | Cannot attach to existing org or elevate global roles via accept |
| Public registration blocked | **PASS** | `PUBLIC_REGISTRATION_ENABLED=false` → 403 |

---

## 3. Pilot payment security

| Check | Result | Evidence |
|-------|--------|----------|
| ₦100 server-enforced | **PASS** | Catalog + `amountMinor !== LIVE_PILOT_AMOUNT_MINOR` guard |
| No client price override | **PASS** | Body is `reportId` + `idempotencyKey` (+ optional redirect) only |
| Allowlist org/report | **PASS** | Env compare; wrong org → 403; missing report → 404 |
| Attempt policy | **PASS*** | Pending in-flight blocked; max successes; idempotent replay. *TOCTOU residual R2 before intent insert* |
| `LIVE_PILOT_ENABLED` default false | **PASS** | `env.ts` + unit test |
| Kill switch precedence | **PASS** | `assertCheckoutEnabled()` first; tested with kill switch on |
| Public ₦15,000 unchanged | **PASS** | Catalog + standard checkout tests |
| No entitlement pre-settle | **PASS** | Grant count 0 after REDIRECTED create; fulfill only after verified success |
| Refund / dispute / chargeback | **PASS** | Unchanged `FulfillmentService` paths; probe uses `purpose=XRAY_PRO_REPORT` so settle/revoke apply; amount mismatch still fails |
| Verify idempotency | **PASS** | Existing payment-event uniqueness + fulfill CAS (HEAD `31749a3`) |
| No provider calls while checkout disabled | **PASS** | Kill switch throws before `initializeCheckout` |

---

## 4. Production safety

| Check | Result | Notes |
|-------|--------|-------|
| Feature dormant by default | **PASS** | Live-pilot path dead without env arming; public checkout unchanged |
| Existing prod behavior without activation | **PASS** | No change to XRAY_PRO amount; kill switch still blocks charges |
| Credentials privacy | **PASS** | Audit did not print secrets; ops token not in web bundle |
| Migration non-destructive | **PASS** | Additive only |
| Worker compatibility | **PASS** | No worker code changes; fulfillment is purpose-driven |
| Web compatibility | **PASS** | No web UI for pilot invite/checkout yet; catalog hide is API-side |
| No public probe discovery | **PASS** | Filtered from `GET /billing/catalog` |

---

## 5. Regression testing (local, 2026-11-16)

| Run | Files | Tests |
|-----|-------|-------|
| A12 + billing + env + pilot-controls | 7 passed | **56 passed** |
| Security + concurrent-owner + login-throttle | 3 passed | **16 passed** |
| **Combined this audit** | **10 passed** | **72 passed / 0 failed** |

Also:

| Check | Result |
|-------|--------|
| `prisma validate` | **PASS** |
| `prisma migrate status` (local `opero_test`) | **up to date** |
| `@opero/api` typecheck | **PASS** |
| `@opero/api` build | **PASS** |

---

## 6. Residual findings (non-blocking for prep)

| ID | Severity | Finding | Recommendation |
|----|----------|---------|----------------|
| R1 | Low | Invite accept lacks row-level `FOR UPDATE`; relies on CAS + unique email | Accept for prep; optional harden before mass invites |
| R2 | Medium (window-only) | Live-pilot pending check is outside DB transaction; concurrent distinct idempotency keys could double-call provider before intent insert | Close before Authorize C, or accept single-operator serial attempts |
| R3 | Low | CSRF exempt matcher now uses `includes(suffix/)` (slightly broader) | Monitor; consider path-segment exact match later |
| R4 | Low | Probe product `active=true` in DB (hidden only in app) | Optional `active=false` for listing while still resolvable by dedicated helper |
| R5 | Process | Release candidate not yet committed | Owner authorize commit before any deploy |

**No critical findings.**

---

## 7. Release preparation

### Exact commit candidate

Not yet a git commit. Proposed message after owner authorize:

```
feat(a12): pilot bootstrap invites and hidden ₦100 live-pilot checkout

Add ops-issued single-use invitations and a gated XRAY_PRO_LIVE_PROBE
path that stays disabled unless LIVE_PILOT_ENABLED is explicitly armed.
```

**Include only** the RC file set in §1 (plus this audit). Do **not** bundle unrelated untracked docs under `apps/web/docs/phase-9-extraction-audit/`.

**Base:** `31749a375ae5d7a89a66fc6dba05636988429ce3`

### Migration

`20261116140000_a12_pilot_invite_and_probe_price`

### Rehearsal deployment sequence (Authorize B — prep only)

1. Owner reviews this audit + RC diff.  
2. Commit RC locally (owner-authorized).  
3. Deploy API (and migrate) with:  
   - `LIVE_PILOT_ENABLED=false`  
   - `EMERGENCY_DISABLE_CHECKOUT=true`  
   - `PUBLIC_REGISTRATION_ENABLED=false`  
   - `PILOT_MODE=true`  
   - `OPS_STATUS_TOKEN` set  
4. Runtime accept: public catalog still ₦15,000; live-pilot → disabled; `/auth/register` → blocked; ops invite with token works.  
5. **Stop** — no fixtures/charges until Authorize A/C/D.

### Runtime acceptance matrix (prep)

| Check | Expected |
|-------|----------|
| `GET /billing/catalog` | XRAY_PRO `amountMinor=1500000`; no `XRAY_PRO_LIVE_PROBE` |
| `POST …/checkout/live-pilot` | 400 `LIVE_PILOT_DISABLED` or kill-switch |
| `POST …/checkout/xray-pro` | Kill-switch 400 while emergency on |
| `POST /auth/register` | 403 |
| `POST /ops/pilot-invitations` without token | 401 |
| `POST /ops/pilot-invitations` with token | 201 (staging/rehearsal only if authorized) |

### Rollback

1. `LIVE_PILOT_ENABLED=false`  
2. Keep `EMERGENCY_DISABLE_CHECKOUT=true`  
3. Revoke outstanding invites  
4. Redeploy previous API image if needed  
5. Leave migration in place (additive); optional deactivate probe product/price rows — no DROP required for emergency stop  

### Production release prerequisites

1. Owner approve commit + prep deploy (Authorize B).  
2. Confirm prod still: checkout/registration/uploads disabled.  
3. `OPS_STATUS_TOKEN` present before any invite issuance.  
4. Clear or waive §8 Korapay blockers before Authorize C/D.  
5. Fixtures (Authorize A) only after prep deploy healthy.

---

## 8. Remaining Korapay settlement blockers (inherited)

Still **BLOCKED** for live charge (from A12 readiness audit; not cleared by P1/P2):

| ID | Blocker | Severity |
|----|---------|----------|
| B1 | Korapay **Live** dashboard webhook registration not owner-confirmed | P0 |
| B2 | Sandbox Gate C settle proof still open / unresolved | P0 risk |
| B3 | Live KYC / fee schedule / go-live evidence | Owner |
| B4 | UptimeRobot Activate + inbox confirmation | P1 |
| B5 | Production fixtures not created (correct — pending Authorize A) | Process |

**Pilot bootstrap path (former B3 “no invite mechanism”)** is addressed by P1 code; fixture creation remains intentionally not executed.

---

## 9. Required owner approvals

| Approval | Purpose |
|----------|---------|
| **Approve A12-P3 audit** | Accept PASS (prep) / BLOCKED (live charge) |
| **Authorize commit** | Create release SHA from RC file set |
| **Authorize B — prep deploy** | Migrate + release with flags **off** |
| **Authorize A — fixtures** | Ops invite + synthetic report; capture allowlist IDs |
| **Authorize C — window** | Short `LIVE_PILOT_ENABLED=true` + kill switch off |
| **Authorize D — charge** | Single allowlisted ₦100 attempt |
| Korapay E1 / Gate C waiver | Clear §8 before C/D |

---

## 10. Stop for owner review

**Completed:** read-only source/migration/security audit; local migration validate; 72/72 regression tests; typecheck; build; this report.

**Not done:** commit, push, deploy, fixtures, checkout enablement, charges, Increment C.

**Awaiting owner decision on prep release vs. hold for R2 harden / Korapay E1.**
