# M2-P0 WEB PRODUCTION RELEASE REPORT

**Date:** 2026-11-17  
**Verdict: PASS**  
**Authorization:** `AUTHORIZE OPERO CONFIRM-UX PRODUCTION DEPLOY` (resumed after owner GitHub push)

| Item | Value |
|------|--------|
| Approved / deployed SHA | `e7e41b7c4aca392ad882459b14d7d4310c0d00cf` |
| Behavior commit | `86dc4b2d0eb55dfe66ba4573c7b3fd324913a77a` |
| GitHub `main` SHA (API) | `e7e41b7c4aca392ad882459b14d7d4310c0d00cf` |
| Local `origin/main` | `e7e41b7c4aca392ad882459b14d7d4310c0d00cf` |
| Excluded local docs commit | `fef27ad` (not deployed) |
| Rehearsal web deployment | `ef7c2b9a-d68c-468e-86a2-a96d643900b6` · **SUCCESS** |
| Production web deployment | `cdc0949a-8ddf-41fb-92af-74b6b2a8c22a` · **SUCCESS** |

No API/worker deploy. No migrations. No env var changes. No production figure confirmations. No payments/uploads/checkout/registration activation.

---

## 1. GitHub verification

| Check | Result |
|-------|--------|
| `origin/main` == approved SHA | **PASS** |
| GitHub API `repos/novemberman/opero/commits/main` | **PASS** → `e7e41b7…` |
| Owner push of approved tip (agent SSH still passphrase-locked for fetch) | **PASS** (remote SHA confirmed via API + local tracking ref) |

---

## 2. Rehearsal (`korapay-rehearsal` / `opero-web`)

| Item | Evidence |
|------|----------|
| Method | `railway redeploy -s opero-web -e korapay-rehearsal --commit e7e41b7… -y` |
| Deployment ID | `ef7c2b9a-d68c-468e-86a2-a96d643900b6` |
| Status / source SHA | **SUCCESS** / `e7e41b7c4aca392ad882459b14d7d4310c0d00cf` |
| Web health | `GET /health` → **200** |
| Login | `GET /login` → **200** |
| Confirm specimen | `GET /design-system/review-confirm` → **200** + `Confirm figure` |
| API unchanged | Latest **SUCCESS** still `8a860ba4-…` @ `bc1567a…` (newer tip only **SKIPPED**) |
| Worker unchanged | Latest **SUCCESS** still `7686a2a3-…` @ `51682da…` |

### Chromium acceptance (synthetic mocks; rehearsal web URL)

```
PLAYWRIGHT_BASE_URL=https://opero-web-korapay-rehearsal.up.railway.app
✓ Confirm figure issues POST /review with CSRF and persists CONFIRMED
✓ failed review shows session-expiry copy and does not mark CONFIRMED
✓ duplicate clicks while submitting issue a single review POST
3 passed
```

**Rehearsal verdict: PASS**

---

## 3. Production preflight

| Check | Result |
|-------|--------|
| API health / ready | **200** / **200** (db/redis/storage ok) |
| API SUCCESS deploy SHA | `bc1567a70c54a16c776390f887d8ca9cb8636859` (`284557e2-…`) |
| Worker SUCCESS deploy SHA | `31749a375ae5d7a89a66fc6dba05636988429ce3` (`be67a5e4-…`) — unchanged |
| PITR resource present | `Postgres-PITR` listed in production |
| Pilot org | present (`6693e901-…`) |
| Pilot document | `cc04b221-…` · `REVIEW_REQUIRED` |
| Mapped monetary figures | **confirmed=0 · pending_mapped=18** |
| `extraction_reviews` | **0** |
| `EMERGENCY_DISABLE_UPLOADS` | **true** |
| `EMERGENCY_DISABLE_CHECKOUT` | **true** |
| `LIVE_PILOT_ENABLED` | **unset → false** |
| `PILOT_UPLOAD_ENABLED` | **false** (window expired `2026-11-16T19:39:44Z`) |
| `PUBLIC_REGISTRATION_ENABLED` | **false** |
| `xray_reports` / `payments` / `entitlement_grants` / `checkout_intents` | **0 / 0 / 0 / 0** |

**Preflight verdict: PASS**

---

## 4. Production web promotion

| Item | Evidence |
|------|----------|
| Method | `railway redeploy -s opero-prd-web -e production --commit e7e41b7… -y` |
| Deployment ID | `cdc0949a-8ddf-41fb-92af-74b6b2a8c22a` |
| Status / source SHA | **SUCCESS** / `e7e41b7c4aca392ad882459b14d7d4310c0d00cf` |
| Env vars modified | **No** |
| Migrations | **None** |
| API/worker redeployed | **No** |

Note: `/health` `version` field still reflects existing `APP_VERSION` env (`31749a3…`) because env mutation was prohibited. Railway deployment source commit is the authoritative release SHA (`e7e41b7…`).

---

## 5. Production acceptance

| Check | Result |
|-------|--------|
| Deployment SUCCESS + exact SHA | **PASS** |
| Web `/health` | **200** |
| `/login` | **200** |
| Pilot Documents page | **200** |
| Pilot document page | **200** |
| Confirm figure UI (specimen) | **PASS** — `data-testid="confirm-figure"` present |
| API health/ready + CORS preflight from web origin | **200** / **200** / **204** |
| Chromium on prod web (mocked APIs only) | **3/3 PASS** |
| Production review POSTs / figure confirmations during gate | **None** (mocks only; no live confirm) |
| Financial counts after deploy | **confirmed=0 · pending_mapped=18 · reviews=0** |
| Reports / payments / entitlements | **0 / 0 / 0** |
| Emergencies / upload / registration | unchanged (**true** / **true** / upload **false** / registration **false**) |
| API SUCCESS still `bc1567a…` | **PASS** (`284557e2-…`) |
| Worker SUCCESS unchanged | **PASS** (`be67a5e4-…` @ `31749a3…`) |
| Rehearsal / staging isolation | Rehearsal web updated only; staging not touched |

---

## Rollback (not used)

Previous verified production web SUCCESS was `8aa575a0-…` @ `f59e65e6f220f96f58d08868a75aaa4d91bc384a`.  
Rollback command if needed: redeploy that SHA only on `opero-prd-web`.

---

## Remaining notes / non-blockers

1. `APP_VERSION` env on web/API still shows `31749a3…` until a separately authorized env update.
2. Optional later API deploy remains available for READY-status reconcile / CSRF allowlist (not required for Confirm POST).
3. Owner still must perform live one-figure Confirm on the pilot document when ready (explicitly out of scope for this release gate).

---

## Verdict

**PASS** — production web is live at `e7e41b7c4aca392ad882459b14d7d4310c0d00cf` with Confirm UX; API/worker isolated; pilot financial records unchanged; shutdowns active.

**STOP FOR OWNER REVIEW.**
