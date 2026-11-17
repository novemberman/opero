# M13-B3 — KORAPAY REDIRECT PRODUCTION RELEASE

**Date:** 2026-11-17  
**Authorization:** `AUTHORIZE OPERO M13-B3 REDIRECT PRODUCTION PROMOTION`  
**Verdict:** **PASS**

**STOP FOR OWNER REVIEW.**

---

## Release identity

| Item | Value |
|------|--------|
| Approved feature commit | `e3c676b` |
| Exact release SHA | `e3c676bd07677b51639557635002420db212e052` |
| Scope | Production **API** + **web** only |
| Worker | **Not deployed** (remains `09037c7a48279bf1350ced6dd3dec91a552a3cb7` / `b4ba8813-…`) |
| Migrations | **None** (finished count stayed **15**) |
| Env changes | **None** |

---

## Deployments

| Service | Deployment ID | Status | SHA |
|---------|---------------|--------|-----|
| `opero-prd-api` | `0c56128f-dbc0-426b-9bed-8c391e66a995` | **SUCCESS** | `e3c676bd07677b51639557635002420db212e052` |
| `opero-prd-web` | `2c5ba76c-83a4-45b2-931e-67eaecdd807c` | **SUCCESS** | `e3c676bd07677b51639557635002420db212e052` |
| `opero-prd-worker` | `b4ba8813-102c-4655-93ce-d239b6512865` | unchanged SUCCESS | `09037c7a48279bf1350ced6dd3dec91a552a3cb7` |

**Rollback tips (pre-release):** API `ced84e50-…` @ `b4f7034…` · Web `572a0dcc-…` @ `09037c7…`

---

## Preflight (PASS)

| Check | Result |
|-------|--------|
| Feature on `origin/main` | yes |
| Unrelated runtime changes | none in feature commit (API billing + web return only + docs) |
| Secrets in commit | none |
| Worker file delta | none |
| Prod health/ready | ok before deploy |
| Migrations finished | **15** |
| Synthetic report `0823d65f-…` | PUBLISHED · content_hash `b47dc3cc…` |
| Pilot doc `cc04b221-…` | READY / CLEAN / SUCCEEDED · 19 line items |
| Active grants | **0** |
| Payments / checkouts / purchases | **0 / 0 / 0** |
| `SYNTHETIC_ENTITLEMENT_ENABLED` | `false` |
| `EMERGENCY_DISABLE_CHECKOUT` / `UPLOADS` | `true` / `true` |
| `PUBLIC_REGISTRATION_ENABLED` | `false` |
| `LIVE_PILOT_ENABLED` | unset → false |
| PITR | previously attested operational (M12-H1 / M11); not mutated this release |

---

## Production acceptance (non-mutating)

| # | Check | Result |
|---|-------|--------|
| 1 | `/billing/return?reference=…` | **HTTP 200** · “Returning from checkout” (not 404) |
| 2 | Return-context unauthenticated | **401** |
| 3 | Return-context authenticated member | endpoint reachable; unknown ref **404** (scoped) |
| 4 | Sandbox ref `opero_29ef2711…` on prod | **404** Payment not found — no production access |
| 5 | Checkout initiation | **400** `EMERGENCY_DISABLE_CHECKOUT` |
| 6 | Payments / entitlements | still **0 / 0** |
| 7 | Report / line items | unchanged (PUBLISHED · hash · 19 lines) |
| 8 | Emergencies + registration | checkout/uploads ON · registration disabled · synthetic issuance OFF |
| — | Billing catalog read | **200** |
| — | Migrations after deploy | still **15** |

No payment verify, no new checkout success, no live charges, no synthetic grants, no worker deploy.

---

## Security notes

- Browser return does not grant entitlements.
- Cross-environment sandbox references cannot resolve on production.
- Checkout remains operator-disabled.

---

## Verdict

**PASS** — Korapay redirect repair live on production API+web at `e3c676bd07677b51639557635002420db212e052`. Commercial checkout remains dormant.
