# M2-P2 WEB RELEASE REPORT

**Date:** 2026-11-17  
**Verdict: PASS**  
**Authorization:** `AUTHORIZE OPERO M2-P2 WEB RELEASE`

| Item | Value |
|------|--------|
| Feature commit | `64b97b96e79c07a32e0b640c37339729d7baa8a2` |
| Deployed / GitHub tip | `15299f14affb4b0c710462329d84f4f0d6c3f395` |
| GitHub `main` | `15299f14affb4b0c710462329d84f4f0d6c3f395` |
| Rehearsal web deployment | `67f8e255-aead-4d7c-99ab-e9ebdbb58e39` · **SUCCESS** |
| Production web deployment | `e99c8352-9ff4-47cf-a716-03944f0d8e57` · **SUCCESS** |

No API/worker deploy. No migrations. No env changes. No production figure confirmations. No uploads/checkout/payments/reports.

---

## Phase 1 — Git

| Check | Result |
|-------|--------|
| Tip contains approved M2-P2 fix `64b97b9` | **PASS** (ancestor) |
| Commits pushed | `fef27ad` (prior BLOCKED docs) → `64b97b9` (fix) → `15299f1` (docs stamp) |
| Secrets / migrations | **None** |
| Remote not diverged | **PASS** (ahead-only from `e7e41b7`) |
| Push (no force) | **PASS** `e7e41b7..15299f1` |
| `origin/main` after push | `15299f1…` |

---

## Phase 2 — Rehearsal (`opero-web` / `korapay-rehearsal`)

| Item | Evidence |
|------|----------|
| Deploy | `--commit 15299f1…` → `67f8e255-…` **SUCCESS** |
| Source SHA | `15299f14affb4b0c710462329d84f4f0d6c3f395` |
| Health | `/health` **200** |
| Default All figures + Confirmed tab | Present on `/design-system/review-confirm`; `all` selected |
| Chromium (synthetic mocks) | **3/3 PASS** — Confirm keeps Revenue CONFIRMED; pending filter drops it; Confirmed/All keep it; 401 copy; duplicate-click |
| API SUCCESS unchanged | `8a860ba4-…` @ `bc1567a…` |
| Worker SUCCESS unchanged | `7686a2a3-…` @ `51682da…` |

**Rehearsal: PASS**

---

## Phase 3 — Production preflight

| Check | Result |
|-------|--------|
| API health / ready | **200** / **200** |
| API SUCCESS | `bc1567a…` (`284557e2-…`) |
| Worker SUCCESS | `31749a3…` (`be67a5e4-…`) |
| PITR | `Postgres-PITR` present |
| Pilot org | present |
| Revenue | **CONFIRMED** · `1250000` · NGN · ACTUAL |
| Mapped monetary | **1 confirmed · 17 pending · 18 total** |
| `extraction_reviews` | **1** |
| Reports / payments / entitlements | **0 / 0 / 0** |
| `EMERGENCY_DISABLE_UPLOADS` | **true** |
| `EMERGENCY_DISABLE_CHECKOUT` | **true** |
| `PILOT_UPLOAD_ENABLED` | **false** (expired window) |
| `PUBLIC_REGISTRATION_ENABLED` | **false** |
| `LIVE_PILOT_ENABLED` | unset → false |

**Preflight: PASS**

---

## Phase 4 — Production web

| Item | Evidence |
|------|----------|
| Method | `railway redeploy -s opero-prd-web -e production --commit 15299f1… -y` |
| Deployment ID | `e99c8352-9ff4-47cf-a716-03944f0d8e57` |
| Status / SHA | **SUCCESS** / `15299f14affb4b0c710462329d84f4f0d6c3f395` |
| Env / migrations / API / worker | **Unchanged** |

---

## Phase 5 — Acceptance

| Check | Result |
|-------|--------|
| Web `/health` | **200** |
| Login / Documents / document page | **200** |
| Default filter **All figures** | **PASS** (`extraction-filter-all` `aria-selected=true`) |
| Confirmed + Pending review tabs | **PASS** |
| Chromium on prod web (mocked APIs) | **3/3 PASS** |
| Financial counts after deploy | **confirmed=1 · pending=17 · total=18** |
| Revenue still CONFIRMED `1250000` | **PASS** |
| `extraction_reviews` | **1** (no new reviews this gate) |
| Reports / payments / entitlements | **0** |
| Emergencies / upload / registration | unchanged |
| API SUCCESS still `bc1567a…` | **PASS** |
| Worker SUCCESS unchanged | **PASS** |

Authenticated pilot document UI uses the same `ExtractionReviewBoard`; hard-refresh should show Revenue under All figures / Confirmed without further confirms. This gate did **not** issue live review POSTs against production figures.

---

## Rollback

Previous production web SUCCESS: `cdc0949a-…` @ `e7e41b7c4aca392ad882459b14d7d4310c0d00cf`.  
Redeploy that SHA on `opero-prd-web` only if needed.

---

## Verdict

**PASS** — production web live at `15299f1…` with confirmed-figure visibility; financial records unchanged; shutdowns active; API/worker isolated.

**STOP FOR OWNER REVIEW.**
