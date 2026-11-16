# PR-2L-B A12-P4 — Release candidate packaging manifest

**Date:** 2026-11-16  
**Mode:** Local packaging + commit only  
**Base (approved):** `31749a375ae5d7a89a66fc6dba05636988429ce3`  
**Parents:** P1/P2 implementation, P3 security audit (PASS), R2 concurrency hardening (PASS)

### Restrictions honored

- No push / deploy / Railway migrate  
- No production fixtures / invite issuance  
- Checkout / registration / uploads / pilot payments **not** enabled  
- No Korapay charges / webhook sends  
- Staging / rehearsal untouched  
- Increment C not started  

---

## Executive verdict

### **PACKAGED — local release candidate committed**

Dormant A12 P1/P2/R2 code is committed locally for owner-authorized prep deploy.  
Live payment window remains **BLOCKED** (inherited Korapay blockers).

| Item | Value |
|------|-------|
| Local commit SHA | _(filled after commit)_ |
| Branch | `main` (local only; **not pushed**) |
| Migrations in commit | 2 additive |
| Final validation | **9 files / 74 tests PASS**; typecheck PASS; build PASS; migrate status up to date |

---

## 1. Exact changed-file inventory

### Included in RC commit

**Modified**

| File | Role |
|------|------|
| `apps/api/src/app.module.ts` | Register `PilotModule` |
| `apps/api/src/auth/csrf.middleware.ts` | Exempt pilot accept + ops invite routes |
| `apps/api/src/billing/billing.controller.ts` | Live-pilot checkout route |
| `apps/api/src/billing/catalog.service.ts` | Hide probe; dedicated probe price helper |
| `apps/api/src/billing/checkout.service.ts` | Live-pilot path + R2 reserve-before-provider |
| `apps/api/src/config/env.ts` | `LIVE_PILOT_*`, invite TTL |
| `apps/api/src/config/env.test.ts` | Default-off assertions |
| `apps/api/src/testing/app-factory.ts` | Optional payment-provider override (tests) |
| `apps/api/src/testing/phase6-fixtures.ts` | Cleanup `pilotBootstrapInvitation` |
| `packages/database/prisma/schema.prisma` | `PilotBootstrapInvitation` + checkout comment |
| `packages/payments/src/index.ts` | Export `PaymentInitError` helpers |
| `packages/payments/src/providers/korapay.ts` | Typed definite/ambiguous init errors |
| `packages/payments/src/providers/korapay.test.ts` | Init-error classification tests |
| `packages/shared/src/index.ts` | Live-pilot constants + body schema |

**Added — implementation**

| File | Role |
|------|------|
| `apps/api/src/pilot/pilot.module.ts` | Pilot module |
| `apps/api/src/pilot/pilot-invitation.service.ts` | Invite issue/accept/revoke + org bootstrap |
| `apps/api/src/pilot/pilot-invitation.controller.ts` | Accept API |
| `apps/api/src/pilot/pilot-ops.controller.ts` | Ops issue/revoke |
| `packages/payments/src/providers/init-errors.ts` | `PaymentInitError` |
| `packages/database/prisma/migrations/20261116140000_a12_pilot_invite_and_probe_price/migration.sql` | Invites + ₦100 probe seed |
| `packages/database/prisma/migrations/20261116170000_a12_live_pilot_active_attempt_guard/migration.sql` | Active-attempt partial unique index |

**Added — tests**

| File | Role |
|------|------|
| `apps/api/src/pilot/a12-pilot-invite.integration.test.ts` | Invitation security |
| `apps/api/src/billing/a12-live-pilot-pricing.integration.test.ts` | Pricing / kill-switch / allowlist |
| `apps/api/src/billing/a12-live-pilot-concurrency.integration.test.ts` | R2 concurrency |

**Added — authorized A12 docs**

| File | Role |
|------|------|
| `apps/web/docs/phase-9-extraction-audit/PR2L-B-A12-P1-P2-SECURE-LIVE-PILOT-IMPLEMENTATION.md` | P1/P2 implementation |
| `apps/web/docs/phase-9-extraction-audit/PR2L-B-A12-P3-RELEASE-SECURITY-AUDIT.md` | P3 audit |
| `apps/web/docs/phase-9-extraction-audit/PR2L-B-A12-P3-R2-CONCURRENCY-HARDENING-REPORT.md` | R2 hardening |
| `apps/web/docs/phase-9-extraction-audit/PR2L-B-A12-P4-RELEASE-CANDIDATE-MANIFEST.md` | This manifest |

### Explicitly excluded (left untracked)

- All non-A12 phase-9 audit docs (B2, A9, A11, PR2 Korapay Gate C, PR2L-A, etc.)
- `PR2L-B-A12-P-LIVE-PILOT-PREPARATION.md` (planning parent)
- `PR2L-B-A12-KORAPAY-LIVE-READINESS-AUDIT.md` (inherited readiness audit; not code RC)
- Credentials / `.env` / temporary secrets
- Unrelated application changes (none present beyond A12 set)

---

## 2. Migration identifiers

| Order | Identifier | Additive? |
|-------|------------|-----------|
| 13 | `20261116140000_a12_pilot_invite_and_probe_price` | **Yes** — new invite table; INSERT probe product/price only |
| 14 | `20261116170000_a12_live_pilot_active_attempt_guard` | **Yes** — partial unique index on active pilot attempts |

### Verification

| Check | Result |
|-------|--------|
| Prior 12 migrations unchanged vs base | **PASS** (git diff quiet for each) |
| Order after `20261115193000_pr2l_a_payment_disputes` | **PASS** |
| No DROP / UPDATE of existing payment rows | **PASS** |
| Probe INSERT does not mutate `XRAY_PRO.NGN` | **PASS** |
| Partial unique limited to `XRAY_PRO_LIVE_PROBE` + active statuses | **PASS** |
| Local `opero` / `opero_test` migrate status | **up to date (14)** |
| Production migration applied | **No** (not run) |

---

## 3. Test results (final validation)

| Suite | Result |
|-------|--------|
| `a12-live-pilot-concurrency.integration.test.ts` | PASS |
| `a12-live-pilot-pricing.integration.test.ts` | PASS |
| `billing.integration.test.ts` | PASS |
| `a12-pilot-invite.integration.test.ts` | PASS |
| `pilot-controls.integration.test.ts` | PASS |
| `security.integration.test.ts` | PASS |
| `concurrent-owner.integration.test.ts` | PASS |
| `login-throttle.integration.test.ts` | PASS |
| `env.test.ts` | PASS |
| **Combined** | **9 files / 74 tests PASS** |
| `prisma validate` | PASS |
| `prisma migrate status` (local `opero_test`) | up to date |
| `@opero/api` typecheck | PASS |
| `@opero/api` build | PASS |

---

## 4. Feature-flag defaults (safe dormant posture)

| Variable | Code default | Prep-deploy posture |
|----------|--------------|---------------------|
| `LIVE_PILOT_ENABLED` | **false** | Keep false |
| `LIVE_PILOT_EXPIRES_AT` | unset | Required only when arming |
| `LIVE_PILOT_ORG_ID` / `REPORT_ID` | unset | Required only when arming |
| `LIVE_PILOT_MAX_SUCCESSES` | 1 | Keep 1 |
| `PILOT_BOOTSTRAP_INVITE_TTL_HOURS` | 72 | OK |
| `EMERGENCY_DISABLE_CHECKOUT` | false in schema | **true in prod ops** until Authorize C |
| `PUBLIC_REGISTRATION_ENABLED` | true in schema | **false** when `PILOT_MODE` + production |
| `OPS_STATUS_TOKEN` | optional | **Must be set** before any invite |

Public `XRAY_PRO.NGN` remains **₦15,000** (`amountMinor=1500000`). Probe is ₦100 and catalog-hidden.

---

## 5. Rehearsal deployment plan (Authorize B — prep only)

1. Owner reviews this manifest + RC commit SHA.  
2. **Owner-authorized** push (this packaging step does **not** push).  
3. Deploy API + apply both migrations with flags off:  
   - `LIVE_PILOT_ENABLED=false`  
   - `EMERGENCY_DISABLE_CHECKOUT=true`  
   - `PUBLIC_REGISTRATION_ENABLED=false`  
   - `PILOT_MODE=true`  
   - `OPS_STATUS_TOKEN` set  
4. Runtime accept: catalog still ₦15,000; live-pilot → disabled/kill-switch; register → blocked; ops invite with token works.  
5. **Stop** — no fixtures/charges until Authorize A/C/D.

---

## 6. Rollback and recovery

### Immediate kill (no redeploy)

1. `LIVE_PILOT_ENABLED=false`  
2. Keep / set `EMERGENCY_DISABLE_CHECKOUT=true`  
3. Revoke outstanding pilot invites via ops revoke  

### Application rollback

4. Redeploy previous API image (`31749a3`) if needed  

### Migration rollback

5. **Leave migrations in place** (additive; safe with flags off).  
6. Optional: deactivate probe product/price rows (`active=false`) — no DROP required.  
7. Index-only emergency drop (rarely needed):  
   `DROP INDEX IF EXISTS checkout_intents_live_pilot_active_attempt_uidx;`  
8. Do **not** drop `pilot_bootstrap_invitations` in emergency path unless owner explicitly authorizes destructive rollback.

### Ambiguous payment recovery

9. Do not open a second live-pilot attempt after ambiguous provider init without ops verify of the reserved reference.  
10. Rely on `LIVE_PILOT_MAX_SUCCESSES` + fulfill CAS to prevent duplicate entitlements.

---

## 7. Remaining live-payment blockers

Inherited from A12 Korapay readiness / P3 §8 — **not cleared** by this packaging:

| ID | Blocker | Severity |
|----|---------|----------|
| B1 | Korapay **Live** dashboard webhook registration not owner-confirmed | P0 |
| B2 | Sandbox Gate C settle proof still open / unresolved | P0 risk |
| B3 | Live KYC / fee schedule / go-live evidence | Owner |
| B4 | UptimeRobot Activate + inbox confirmation | P1 |
| B5 | Production fixtures not created (correct — pending Authorize A) | Process |

R2 concurrency residual (TTL after ambiguous init) remains **Low** — see R2 report.

---

## 8. Owner decision gate

| Approval | Purpose |
|----------|---------|
| **Accept P4 packaging** | Confirm local SHA is the prep RC |
| **Authorize push** | Publish SHA to GitHub (not done here) |
| **Authorize B — prep deploy** | Migrate + release with flags **off** |
| **Authorize A — fixtures** | Ops invite + synthetic report; capture allowlist IDs |
| **Authorize C — window** | Short `LIVE_PILOT_ENABLED=true` + kill switch off |
| **Authorize D — charge** | Single allowlisted ₦100 attempt |
| Korapay E1 / Gate C waiver | Clear §7 before C/D |

### STOP FOR OWNER REVIEW

**Done:** source inventory; migration verification; final validation; local commit; this manifest.  
**Not done:** push, deploy, production migrate, fixtures, checkout enablement, charges, Increment C.
