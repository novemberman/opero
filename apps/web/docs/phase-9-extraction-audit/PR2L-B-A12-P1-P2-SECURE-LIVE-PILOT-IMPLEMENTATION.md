# PR-2L-B A12-P1/P2 — Secure live-pilot preparation (local implementation)

**Date:** 2026-11-16  
**Mode:** Local implement + test only  
**Parent plan:** `PR2L-B-A12-P-LIVE-PILOT-PREPARATION.md`  
**Verdict:** **READY FOR OWNER REVIEW** — code + local validation complete; **not** authorized for production deploy, fixture creation, checkout enablement, or charges.

### Restrictions honored

- No push / deploy / production migrate  
- No production users, orgs, or reports  
- Checkout not enabled in production  
- No Korapay charges or webhook sends  
- No live credential changes  
- Staging / rehearsal untouched  
- Increment C not started  

---

## 1. Implementation changes

### P1 — Invitation-based pilot onboarding

| Area | Change |
|------|--------|
| Schema | `PilotBootstrapInvitation` model (`pilot_bootstrap_invitations`) — hashed token, expiry, revoke, single-use consume, optional consumed user/org FKs |
| Ops API | `POST /api/v1/ops/pilot-invitations` — requires `OPS_STATUS_TOKEN`; returns raw token once; emails invitee |
| Ops revoke | `POST /api/v1/ops/pilot-invitations/:id/revoke` |
| Accept API | `POST /api/v1/auth/pilot-invitations/accept` — creates user + org + OWNER membership; password min 12; marks email verified (same model as org invitations) |
| Caps | Honors `PILOT_MAX_USERS` / `PILOT_MAX_ORGANIZATIONS` under advisory locks |
| Audit | `pilot.invite_created`, `pilot.invite_revoked`, `pilot.invite_accepted`, `org.created` |
| CSRF | Exempt accept + ops invite routes (ops token / single-use token gated) |
| Public reg | Remains blocked when `PUBLIC_REGISTRATION_ENABLED=false`; no SQL bootstrap |

**Key files**

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20261116140000_a12_pilot_invite_and_probe_price/`
- `apps/api/src/pilot/*` (`PilotModule`, invitation service/controllers)
- `packages/shared/src/index.ts` — invite body schemas
- `apps/api/src/config/env.ts` — `PILOT_BOOTSTRAP_INVITE_TTL_HOURS` (default 72)
- `apps/api/src/auth/csrf.middleware.ts`

### P2 — Hidden ₦100 pilot payment

| Area | Change |
|------|--------|
| Catalog seed | Product `XRAY_PRO_LIVE_PROBE` / price `XRAY_PRO_LIVE_PROBE.NGN` at **₦100** (`amountMinor=10000`); **does not** mutate `XRAY_PRO.NGN` (₦15,000) |
| Public catalog | Probe product filtered out of `publicCatalog()`; `requireActivePriceByProductCode` refuses probe code |
| Checkout path | `POST …/billing/checkout/live-pilot` → `CheckoutService.startLivePilotCheckout` |
| Gates | `EMERGENCY_DISABLE_CHECKOUT` always first; then `LIVE_PILOT_ENABLED`, expiry, org/report allowlist |
| Amount | Server resolves probe price; rejects if ≠ ₦100; client cannot override |
| Attempt limit | One in-flight attempt per allowlisted org/report; `LIVE_PILOT_MAX_SUCCESSES` (default 1) after SUCCEEDED |
| Lock | When `LIVE_PILOT_ENABLED=true`, public X-Ray Pro / subscription checkout blocked (`LIVE_PILOT_LOCK`) |
| Entitlement | No grants until existing settlement/fulfillment path (unchanged); probe uses purpose `XRAY_PRO_REPORT` |
| Audit | `billing.live_pilot_checkout_created` |

**Key files**

- `apps/api/src/billing/catalog.service.ts`
- `apps/api/src/billing/checkout.service.ts`
- `apps/api/src/billing/billing.controller.ts`
- `packages/shared` — `LIVE_PILOT_*` constants + `livePilotCheckoutBodySchema`
- `apps/api/src/config/env.ts` — `LIVE_PILOT_ENABLED` default **false**, allowlist/expiry/max successes

---

## 2. Migration requirements

Migration: `20261116140000_a12_pilot_invite_and_probe_price`

1. Creates `pilot_bootstrap_invitations` (+ indexes/FKs).  
2. Inserts hidden probe product/price into active pricing version `11111111-1111-4111-8111-111111111111`.

**Local status:** Applied to local `opero` and `opero_test` only.  
**Production:** Do **not** apply until a separate deploy authorization. Deploy order: migrate → release API with `LIVE_PILOT_ENABLED=false` and `EMERGENCY_DISABLE_CHECKOUT=true`.

---

## 3. Security test results

Suites run locally (2026-11-16):

| Suite | Result |
|-------|--------|
| `a12-pilot-invite.integration.test.ts` | **6/6 PASS** |
| `a12-live-pilot-pricing.integration.test.ts` | **PASS** |
| `pilot-controls.integration.test.ts` | **PASS** |
| `billing.integration.test.ts` | **PASS** (standard ₦15,000 + refund/dispute path unchanged) |
| `env.test.ts` | **PASS** (incl. `LIVE_PILOT_ENABLED` default false) |
| **Total** | **49/49 PASS** |

| Acceptance check | Result |
|-------------------|--------|
| Public registration blocked | PASS |
| Unauthorized invite creation rejected | PASS |
| Expired / reused / revoked / bogus invite rejected | PASS |
| Weak password rejected | PASS |
| Cross-tenant org access denied (404) | PASS |
| Probe absent from public catalog | PASS |
| Standard XRAY_PRO remains ₦15,000 | PASS |
| Pilot price unavailable when disabled / wrong org-report | PASS |
| Kill switch blocks live-pilot + public checkout | PASS |
| No entitlement before settlement | PASS |
| One in-flight pilot attempt enforced | PASS |
| Expired `LIVE_PILOT_EXPIRES_AT` rejected | PASS |

**Validation also run**

- `@opero/api` typecheck — PASS  
- `@opero/api` build — PASS  
- `@opero/database` / `@opero/shared` typecheck — PASS  

---

## 4. Configuration requirements

### Always (pilot production posture)

```bash
PILOT_MODE=true
PUBLIC_REGISTRATION_ENABLED=false
OPS_STATUS_TOKEN=<≥16 char secret>
PILOT_BOOTSTRAP_INVITE_TTL_HOURS=72   # optional; default 72
EMERGENCY_DISABLE_CHECKOUT=true      # until owner opens a charge window
EMERGENCY_DISABLE_UPLOADS=true       # if still required by pilot policy
```

### Live-pilot pricing (defaults — leave off until Authorize C)

```bash
LIVE_PILOT_ENABLED=false             # DEFAULT — must stay false until charge window
LIVE_PILOT_EXPIRES_AT=               # ISO-8601; required when enabling
LIVE_PILOT_ORG_ID=                   # uuid; required when enabling
LIVE_PILOT_REPORT_ID=                # uuid; required when enabling
LIVE_PILOT_MAX_SUCCESSES=1
```

### Ops invite issuance (local/staging pattern)

```http
POST /api/v1/ops/pilot-invitations
X-Ops-Token: <OPS_STATUS_TOKEN>
{ "email", "organizationName", "organizationSlug", "createdByLabel" }
```

```http
POST /api/v1/auth/pilot-invitations/accept
{ "token", "name", "password" }  # password ≥ 12
```

### Live-pilot checkout (only when kill switch off + window armed)

```http
POST /api/v1/organizations/:orgId/billing/checkout/live-pilot
{ "reportId", "idempotencyKey", "redirectUrl?" }
```

---

## 5. Deployment plan (owner-authorized only — **not executed**)

Aligned with A12-P §6 gates; this milestone stops before Authorize A–D.

1. **Code review** of this report + diff.  
2. **Authorize deploy B (prep):** migrate + release with `LIVE_PILOT_ENABLED=false`, checkout still disabled; no fixtures.  
3. **Authorize A (fixtures):** issue invite via ops API; create synthetic report; capture `LIVE_PILOT_ORG_ID` / `LIVE_PILOT_REPORT_ID`.  
4. **Authorize C (window):** set expiry + allowlist; briefly set `LIVE_PILOT_ENABLED=true` and `EMERGENCY_DISABLE_CHECKOUT=false`.  
5. **Authorize D (charge):** single allowlisted attempt; then disable window.  
6. Do **not** begin Increment C from this workstream.

---

## 6. Rollback plan

| Layer | Action |
|-------|--------|
| Runtime | Set `LIVE_PILOT_ENABLED=false`; keep/set `EMERGENCY_DISABLE_CHECKOUT=true` |
| Invites | Revoke outstanding invites via ops revoke; leave `PUBLIC_REGISTRATION_ENABLED=false` |
| Catalog | Probe price can remain in DB (hidden); optional `active=false` on probe product/price |
| Code | Revert API release if needed; migration is additive (table + insert) — do not drop in prod without explicit authorize |
| Payments | Existing refund/dispute handlers unchanged; cancel any PENDING pilot checkout via normal ops |

---

## 7. Stop for owner review

**Completed locally:** P1 invite onboarding, P2 ₦100 gated checkout, security tests, typecheck, build, this report.

**Not done (by design):** production deploy, production migrate, production fixtures, checkout enablement, Korapay Live charges, staging/rehearsal changes, Increment C.

Awaiting owner authorization before any further gate.
