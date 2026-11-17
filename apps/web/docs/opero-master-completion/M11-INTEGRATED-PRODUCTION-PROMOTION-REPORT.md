# M11 INTEGRATED PRODUCTION PROMOTION REPORT

**Date:** 2026-11-17  
**Authorization:** `AUTHORIZE OPERO M11 INTEGRATED PRODUCTION PROMOTION`  
**Verdict:** **PASS**  
**Commercial / Increment C:** still **NO-GO** (dormant; emergencies ON; Gate C unverified)

| Item | Value |
|------|--------|
| GitHub release SHA | `09037c7a48279bf1350ced6dd3dec91a552a3cb7` |
| Target | Railway `opero` / `production` |
| Migration | `20261117120000_m6_report_generate_entitlement` |
| Preflight | PASS (revalidated immediately before promote) |

**Not performed:** diagnostics, AI interpretation, report generation/publish, live Korapay charges, upload/checkout/registration enablement, storage remap, infra purchases.

---

## Phase 1 — Mandatory preflight (revalidated)

| Check | Result |
|-------|--------|
| `origin/main` contains release SHA | **PASS** |
| Rehearsal API/worker/web SUCCESS @ release | **PASS** (`607b10c0…` / `e4984408…` / `b2bdcb19…`) |
| Production health pre-promote | API ready DB/Redis/storage **ok**; web **ok** |
| PITR | **enabled** + `bucketWired`; live available |
| Migrations | **14**; M6 absent |
| Pilot OWNER | `pilot@opero.coworkxspace.com` OWNER intact |
| Pilot doc `cc04b221-…` | READY / SUCCEEDED |
| Mapped monetary confirms | **18**; corrected **0** |
| Reports / payments / grants / checkouts / diagnostics / AI | **0** |
| Emergencies / registration / pilot upload | uploads **true**, checkout **true**, registration **false**, pilot upload **false**, live pilot unset→false |
| AI | unset → **mock** default (not live intelligence) |
| Pre-migrate backup | on-demand PITR backup workflow `createVolumeInstanceBackup/b7e2439a-327b-4c00-9eaf-94c20c82cd4e` · wall `2026-11-17T09:16:05Z` |

---

## Phase 2 — Migration

| Item | Evidence |
|------|----------|
| Contents | Additive `INSERT … ON CONFLICT DO NOTHING` for two OS plan `xray.report_generate` rows (sha256 `24453b958246…`) |
| Executor | API preDeploy `prisma migrate deploy` |
| Applied | `2026-11-17T09:17:42.498Z` |
| Deploy logs | `Applying migration 20261117120000_m6_report_generate_entitlement` → `All migrations have been successfully applied` → `Migration deploy completed successfully` |
| Count | **14 → 15**; M6 recorded **once** |
| Entitlement rows | **2** plan entitlements |
| Pilot integrity post-migrate | READY/SUCCEEDED; **18** mapped CONFIRMED; corrected 0 |

No automatic DB rollback performed or required.

---

## Phase 3 — Coordinated deployment

| Order | Service | Deployment ID | Status | Commit |
|------:|---------|---------------|--------|--------|
| 1 | `opero-prd-api` | `83331ff1-6c72-4306-b178-070558034b84` | **SUCCESS** | `09037c7…` |
| 2 | `opero-prd-worker` | `b4ba8813-102c-4655-93ce-d239b6512865` | **SUCCESS** | `09037c7…` |
| 3 | `opero-prd-web` | `572a0dcc-ba95-4a8d-a076-8d18eb7047d9` | **SUCCESS** | `09037c7…` |

After each service: SUCCESS observed; emergencies re-checked after API (still ON); API ready remained green after API cutover.

**Note:** `APP_VERSION` env stamp still `31749a3…` (D-P2-003); deploy commit is `09037c7…`.

---

## Phase 4 — Production acceptance (non-transactional)

| Check | Result |
|-------|--------|
| API `/api/v1/health` | **200** ok |
| API `/api/v1/ready` | **200** ready · database/redis/storage **ok** |
| Web `/health` | **200** ok |
| Web `/login` | **200** |
| Web home | **200** |
| Worker | SUCCESS deploy; API ready confirms Redis connectivity used by queues |
| Pilot doc unchanged | READY / SUCCEEDED / ACTIVE / CLEAN |
| Confirmations preserved | mapped **18** CONFIRMED · pending/corrected/rejected **0** |
| Extraction reviews | **19** (unchanged count; no new review mutations in this gate) |
| Reconcile audits | still **1** |
| Active documents | **1** |
| Diagnostics / AI runs | **0** / **0** |
| Reports / payments / grants / checkouts | **0** / **0** / **0** / **0** |
| Registration | **403** `PUBLIC_REGISTRATION_DISABLED` |
| Upload/checkout unauthenticated | blocked (**403** CSRF / auth wall) |
| Doc status unauthenticated | **401** |
| Emergencies | uploads **true**, checkout **true** |
| AI provider | unset → **mock**; not configured/advertised as live OpenAI |
| PITR | enabled + bucketWired + live available |
| Cost | Railway redeploys + additive migration only; ₦0 payments; mock AI unused |

Authenticated emergency-code probes were not repeated with the pilot password in this gate; environment flags and CSRF/auth walls confirm dormant commercial posture. Rehearsal previously demonstrated `EMERGENCY_DISABLE_UPLOADS` / `EMERGENCY_DISABLE_CHECKOUT` response codes under session.

---

## Failure handling

Not invoked — all services SUCCESS; acceptance PASS.

Rollback references if needed later:

| Service | Prior SUCCESS |
|---------|---------------|
| API | `baa04a73-…` @ `77ecbf6…` |
| Worker | `be67a5e4-…` @ `31749a3…` |
| Web | `e99c8352-…` @ `15299f1…` |

M6 rows are additive; app rollback does not auto-reverse them.

---

## Remaining production pilot prerequisites

1. Separate owner authorization for **Stage B** synthetic diagnostics / BHS / AI / report generation in production.  
2. Explicit decision: keep mock AI vs configure live OpenAI (do not present mock as live intelligence).  
3. Korapay Gate C still required before any live charge / checkout enablement.  
4. Uploads / registration / live pilot remain owner-gated.  
5. Optional follow-ups: APP_VERSION stamp (D-P2-003); OrgMembershipGuard audit FK 500 on nonexistent orgs; retention hard-purge policy.

---

## STOP FOR OWNER REVIEW

Production integrated financial-intelligence code is live at `09037c7…` with schema **15**, emergencies **ON**, and **no** production diagnostics/reports/payments generated in this gate.
