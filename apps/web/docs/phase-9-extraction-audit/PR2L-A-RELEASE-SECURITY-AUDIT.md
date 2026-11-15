# PR-2L-A — Chargeback protection release security audit

**Date:** 2026-11-15  
**Base commit:** `76ffe55` (feat: revoke entitlements on Korapay chargebacks and disputes)  
**Audit corrections:** local only (CAS fulfill/refund/dispute hardening) — **not pushed / not deployed**  
**Verdict:** **PASS WITH OWNER GATES** — payment disputes cannot be used to obtain or restore report access improperly under the verified controls below.

---

## 1. Security verdict

| Area | Verdict |
|------|---------|
| State-machine security | **PASS** (after CAS hardening) |
| Manual dispute endpoint | **PASS** |
| Provider webhook contract | **PASS** |
| Report authorization | **PASS** |
| Tests / builds | **PASS** |
| Deployment readiness | **READY for owner-authorized deploy** (migrate first; API-only; staging auto-deploy still disabled) |

**Objective satisfied:** Suspended, refunded, and chargebacked PURCHASE entitlements stay revoked across duplicates, out-of-order events, late verifies, concurrent webhooks, and process restart (DB-persisted `revokedAt` + terminal payment status).

---

## 2. Corrections applied during audit (local)

1. **CAS on dispute/chargeback transitions** (`suspendOrRevokeAccess`): `updateMany` only from allowed predecessors; losing racers still revoke grants; never soften harder status.
2. **CAS on refund**: cannot overwrite `CHARGEBACK`; losing racer still ensures grants revoked.
3. **CAS on merchant-favor restore**: only `DISPUTED` → `SUCCEEDED`; concurrent chargeback/refund wins with `409 INVALID_DISPUTE_TRANSITION`.
4. **CAS on late fulfillment**: lock + settle only from `PENDING|FAILED|SUCCEEDED`; terminal status mid-flight returns `ACCESS_REVOKED` and does **not** clear `revokedAt` via grant upsert.
5. **Integration coverage:** viewer denial, merchant-favor blocked after refund, concurrent `chargeback.lost`, late verify after chargeback.

No production, staging, or rehearsal changes were made. No payments initiated. Increment C not started.

---

## 3. State-transition matrix

Severity (monotonic): `SUCCEEDED (1) < DISPUTED (2) < REFUNDED/PARTIALLY_REFUNDED (3) < CHARGEBACK (4)`

| From \ Event | pending/declined | lost/partial/auto_accepted | refund.success | manual open | manual confirm_chargeback | manual resolve_merchant_favor | late charge.success/verify |
|--------------|------------------|----------------------------|----------------|-------------|---------------------------|-------------------------------|----------------------------|
| SUCCEEDED | → DISPUTED (suspend) | → CHARGEBACK (revoke) | → REFUNDED (revoke) | → DISPUTED | → CHARGEBACK | 409 | fulfill / ALREADY_FULFILLED |
| DISPUTED | idempotent / refresh revoke | → CHARGEBACK | → REFUNDED | idempotent | → CHARGEBACK | → SUCCEEDED (restore) | ACCESS_REVOKED |
| REFUNDED | ignore (harder) + keep revoked | → CHARGEBACK | idempotent revoke | 409 | 409 | 409 | ACCESS_REVOKED |
| CHARGEBACK | ignore (harder) + keep revoked | idempotent | ignore (keep CHARGEBACK) | 409 | idempotent | 409 | ACCESS_REVOKED |
| PENDING/FAILED | PAYMENT_NOT_SETTLED | PAYMENT_NOT_SETTLED | → REFUNDED | 409 | 409 | 409 | normal fulfill path (CAS) |

**Entitlement effect**

| Payment status | PURCHASE grants for that payment | PDF download |
|----------------|----------------------------------|--------------|
| SUCCEEDED (fulfilled) | Active (`revokedAt` null) | Allowed |
| DISPUTED | Suspended | `403 ENTITLEMENT_REQUIRED` |
| REFUNDED / CHARGEBACK | Revoked | `403 ENTITLEMENT_REQUIRED` |
| Sibling report purchase | Unaffected | Still allowed if entitled |

Restart persistence: statuses and `entitlement_grants.revokedAt` live in Postgres; no in-memory entitlement cache gates downloads.

---

## 4. Manual dispute endpoint

`POST /api/v1/organizations/:organizationId/billing/payments/:reference/disputes`

| Control | Result |
|---------|--------|
| Auth | `SessionAuthGuard` + `OrgMembershipGuard` + `PermissionsGuard` |
| Permission | `billing:manage` (OWNER/ADMIN); VIEWER → 403 |
| Org isolation | Payment lookup scoped by `organizationId`; cross-org → 404 `PAYMENT_NOT_FOUND` |
| CSRF | **Not** in CSRF exempt list; requires `x-csrf-token` |
| Rate limit | `@Throttle` 20 / 60s |
| Body | Strict Zod: `action` enum + `reason` min 3; optional evidence / provider ref |
| Audit | `payment_dispute_actions` row + `billing.payment_dispute_manual` audit |
| Transitions | Enforced in service; merchant-favor **only** from `DISPUTED` |
| Confirmed chargeback / refund restore | **Blocked** (409); no separately authorized restore path implemented (by design) |

---

## 5. Provider webhook contract

| Control | Result |
|---------|--------|
| Documented chargeback events only | `chargeback.pending\|declined\|lost\|partial\|auto_accepted` via `isKorapayChargebackEvent`; `chargeback.won` **not** accepted as webhook |
| Signature | HMAC verified before mutation; invalid → 200 ack, unique `invalid:…` event key, no entitlement change |
| Reference match | Lookup by merchant `reference` or `providerReference`; unmatched → 200 `matched:false`, no mutation |
| Dedupe / replay | Unique `providerEventKey` → duplicate no-op |
| Unknown / unhandled events | Logged; no entitlement change |
| Logging | Warns use event type + reference; secrets not logged by provider client. Full webhook body stored in `payment_events.payload` for ops (provider-controlled; no Opero secrets) |

---

## 6. Report authorization

| Check | Result |
|-------|--------|
| Suspended download | 403 `ENTITLEMENT_REQUIRED` |
| Revoked (chargeback/refund) download | 403 |
| Sibling purchased report | Still 200 |
| Cross-tenant | Denied via org guards / storage key prefix `org/{orgId}/reports/…` |
| Direct private storage | Downloads only through API after entitlement + key prefix check |

**Residual limitation:** Previously downloaded PDF files cannot be remotely recalled.

---

## 7. Test and build results

| Suite | Result |
|-------|--------|
| `@opero/payments` unit | **22 passed** |
| `billing.integration.test.ts` (incl. chargeback + manual disputes) | **13 passed** |
| `security.integration.test.ts` + report integrity + phase6 workflow | **24 passed** |
| `apps/api` `tsc --noEmit` | **pass** |
| `Dockerfile.api` → `opero-api:pr2la-audit` / rebuild | **pass** (see local docker log) |

Note: One earlier parallel run of billing vs other suites hit shared `opero_test` fixture races (401 org create / diagnostic snapshot). Solo re-run: all 13 billing tests green.

---

## 8. Deployment requirements

| Item | Requirement |
|------|-------------|
| DB migration | **Required:** `20261115193000_pr2l_a_payment_disputes` (enums `DISPUTED`/`CHARGEBACK` + `payment_dispute_actions`) |
| Services | **API-only** code change sufficient (web/worker unchanged for this PR) |
| Order | `prisma migrate deploy` **before** or via API preDeploy, then roll API image |
| Rehearsal | Safe to receive **after migrate**; currently on older image (`51682da`); dedicated DB; auto-deploy patterns should remain disabled until owner push |
| Shared staging auto-deploy | **Still disabled** (`watchPatterns` = `__opero_auto_deploy_disabled__/**` per Gate A/B status) |
| Live payments | **Do not** enable unsupervised live / Increment C in this window |

---

## 9. Rollback plan

1. Redeploy previous API image (pre-PR-2L-A).
2. **Keep** migration (additive enums/table — safe to leave).
3. Do **not** delete `payment_dispute_actions` or reverse terminal statuses in bulk.
4. Persisted `DISPUTED`/`CHARGEBACK`/`REFUNDED` + `revokedAt` remain correct under old code paths that already respect `revokedAt` for PDF gates; old code may not understand new enum labels in admin UIs — prefer forward-fix over migrate-down.
5. If a payment was merchant-favor restored then rolled back mid-flight, re-apply chargeback via webhook or manual `confirm_chargeback` after re-deploy.

---

## 10. Remaining provider-specific limitations

1. No documented `chargeback.won` webhook → restore only via authenticated manual `resolve_merchant_favor` from `DISPUTED`.
2. No chargeback list/get reconciliation poller yet.
3. Outbound refund / chargeback-respond APIs not wired (dashboard ops).
4. Partial chargebacks revoke full digital access (by design).
5. Prior downloads cannot be recalled.
6. Chargeback events on unsettled (`PENDING`) payments are ignored (`PAYMENT_NOT_SETTLED`) — relies on Korapay emitting after settle; refunds on `PENDING` still revoke when applicable.
7. Gate C hosted checkout end-to-end still separately unproven.

---

## 11. Owner approval gate

**STOP.** Awaiting owner approval before:

- git push
- any environment deploy / migrate
- Korapay live or further sandbox charges
- Increment C
