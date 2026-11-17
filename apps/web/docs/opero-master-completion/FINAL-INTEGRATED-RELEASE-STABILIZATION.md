# FINAL INTEGRATED RELEASE STABILIZATION

**Date:** 2026-11-17  
**Mode:** Local engineering + isolated synthetic tests only  
**Verdict:** **PARTIAL PASS** — internal release blockers resolved locally; commercial launch remains **NO-GO**; controlled rehearsal **GO** after owner-authorized deploy.

**Release candidate tip (post-commit stamp):** see commit created with this document.  
**Prior tip before stabilization commit:** `f4fe3d69c6f096fa04cd2090dd292cff0c0f4767`  
**Origin/main baseline:** `77ecbf6b4954387888bfda24dc747ac038fa6175`  
**Feature lineage ahead of origin (12 commits before this RC):**

| Full SHA | Subject |
|----------|---------|
| `f4fe3d69c6f096fa04cd2090dd292cff0c0f4767` | docs(m6-m10): align final tip SHA references |
| `c50fa0e7d4a672d89d5a36169000f46b6d3e35db` | docs(m6-m10): record final tip SHA on release docs |
| `d2963a081dd2e51965013966ba71db367d081df1` | docs(m6-m10): stamp master completion release candidate SHA |
| `3e64963fe2e0688c5e1227d6bb8c9beddfb3649c` | feat(m6-m10): enforce report_generate entitlement and close local master pack |
| `6ea849bf04409f28741672237f57111d2b9c5e77` | docs(m4-m5): clarify feature RC as authoritative code SHA |
| `c4403f8b18cfeecdfd7adc3ea081eb2a86011169` | docs(m4-m5): finalize integrated manifest tip SHA |
| `be06c87ae9eb245400f60bbd66bd6d10e8cab0ef` | docs(m4-m5): repair integrated manifest docs stamp tip |
| `5a8aaf09fdbb59c7d2a9395a14a2ea81c6ae1453` | docs(m4-m5): record docs stamp tip SHA |
| `98ce34ba4de4a869749114a43bcb650772c7f569` | docs(m4-m5): stamp integrated AI and reporting release candidate SHA |
| `4f7b19361f1cab0fa073b61f8bbdb5e24b00f634` | feat(m4-m5): grounded AI interpretation v2 and financial report lifecycle |
| `a8175592719f503a6cf331b9b8367ee35baf5eb6` | docs(m3): stamp financial diagnostics release candidate SHA |
| `fe7eed6c02b42c7cef5b8582149eaf4869b14b76` | feat(diagnostics): complete M3 KPIs, READY gate, and golden fixture RC |

---

## Phase 1 — Source and migration audit

### Schema / migration

| Item | Detail |
|------|--------|
| New migration | `20261117120000_m6_report_generate_entitlement` |
| Why required | Grants `xray.report_generate` on Opero OS plan rows so organization-scoped OS subscriptions can publish PDFs after M6 entitlement enforcement. X-Ray Pro continues to grant the same code in application entitlements (`XRAY_PRO_ENTITLEMENTS`). |
| SQL shape | Idempotent `INSERT … ON CONFLICT (plan_id, entitlement_code) DO NOTHING` — no DDL, no destructive DML |
| Rollback | Leave-in-place safe; optional delete of the two plan_entitlement rows restores prior grant set without schema reverse |
| Data loss risk | None observed — additive entitlement rows only |

### Isolated migration evidence

| Check | Result |
|-------|--------|
| Fresh DB `prisma migrate deploy` (15 migrations) | **PASS** |
| Baseline 14 (prod-equivalent) then apply M6 only | **PASS** (`14` → `15`; 2 `xray.report_generate` rows) |
| Idempotent redeploy + SQL re-apply | **PASS** |
| Transactional rollback simulation of entitlement rows | **PASS** (rolled back; no residual delete) |
| Production DB touched | **No** |

### Compatibility notes

- Shared packages touched in lineage: `@opero/shared` (entitlements), `@opero/diagnostics`, `@opero/ai`, `@opero/reports`, `@opero/database` (migration only).
- API/worker/web must ship together for READY semantics + generate entitlement + CX surfaces.
- No secrets committed in this stabilization change set.
- Unrelated untracked phase-9 docs / `test-results` / home-dir noise **excluded** from RC.

---

## Phase 2 — D-P0-003 READY semantics

| State | Meaning |
|-------|---------|
| Extraction complete | Pipeline wrote statements/lines; may still be PENDING review |
| Human review complete | Material monetary lines no longer need confirmation (`materialMonetaryNeedsConfirmation` false) |
| Statement / document READY | Persisted `processingStatus=READY` only when material pending is absent (and other quality gates clear) |
| Diagnostic eligibility | Requires READY **and** belt check that no material PENDING lines remain |
| Report eligibility | Upstream READY + diagnostic/report lifecycle + `xray.report_generate` on publish |

**Fix:** Worker terminal status uses the same material-pending predicate as API reconcile; `DiagnosticsService.createRun` refuses sticky READY badges with unconfirmed material lines.

**Regression:** documents IT — extraction ends `REVIEW_REQUIRED` while material PENDING; existing reconcile / PPE / cross-tenant cases retained.

**Status:** **FIXED_LOCAL**

---

## Phase 3 — D-P0-004 unused B2.2 concepts

| Concept family | Decision |
|----------------|----------|
| Investing / financing / net cash change / opening cash / share capital / retained earnings | **Retain** in taxonomy; **optional** for BHS KPI formulas |
| Contribution to diagnostics | Advisory quality identities only when **all** identity inputs present |
| BHS reliability | Absence does **not** invent failures; failures do **not** alter `score.v1` gated consistency |
| Methodology | `SCORE_METHODOLOGY_VERSION` remains `score.v1`; historical scores preserved |
| Tax payable as standalone KPI | Deferred — not required for current BHS dimensions |

**Status:** **FIXED_LOCAL** (advisory wiring) / residual standalone KPI wishlist **DEFERRED**

---

## Phase 4 — D-P1-011 retention purge

| Capability | Status |
|------------|--------|
| Soft-delete + `retentionUntil` | Existing |
| Tenant-scoped dry-run candidate listing | **Implemented** (`RetentionPurgeService.dryRun`) |
| Hard purge / private object deletion execute path | **Not enabled** |
| Legal-hold policy | **Owner decision required** |
| Idempotent cleanup / retry | Documented for future execute path; dry-run is read-only |
| Production data deletion during testing | **None** |

**Blocker:** product/legal retention window + legal-hold semantics before enabling execute.

**Status:** **PARTIAL_LOCAL** (safe dry-run)

---

## Phase 5 — Release compatibility

### Deployment dependency graph

```
1) DB migrate: 20261117120000_m6_report_generate_entitlement
2) Build shared → diagnostics / ai / reports / payments / database client
3) Deploy API  (READY belt + entitlement publish gate + retention dry-run service)
4) Deploy worker (READY material-pending terminal status + report integrity)
5) Deploy web (billing/members CX + READY-gated diagnostics UX)
```

Emergency shutdowns (`uploads` / `checkout` / registration / live pilot) retain precedence over feature flags.

### Compatibility matrix (local RC)

| Surface | Status |
|---------|--------|
| Shared package versions (workspace) | Compatible in monorepo tip |
| DB schema | 15 migrations; M6 additive |
| API contract | READY + entitlement 403 after integrity |
| Worker jobs | Document process READY semantics aligned |
| Frontend/backend | Coordinated tip required to clear D-P1-004 skew |
| Feature flags / emergencies | Unchanged intentional ON |

---

## Phase 6 — Full regression evidence

| Suite | Result |
|-------|--------|
| `@opero/diagnostics` | **75 PASS** |
| `@opero/ai` | **151 PASS** |
| `@opero/reports` | **61 PASS** |
| `@opero/shared` | **13 PASS** |
| API documents + retention unit | **10 PASS** |
| API diagnostics IT | **PASS** (included in 60) |
| API billing / reports / phase6b / phase6c / security | **60 PASS** across 8 files |
| API readiness IT | **3 PASS** |
| Worker tests | **57 PASS** |
| Web unit | **99 PASS** |
| Typechecks (diagnostics/api/worker/web) | **PASS** |
| Builds (api/worker/web) | **PASS** |
| Docker Chromium Playwright (`v1.56.1-jammy`, host net, `:3010`) | **5/5 PASS** |
| Isolated migration tests | **PASS** |
| Cross-tenant authorization (documents/billing/security IT) | **PASS** |

No production data mutations. Synthetic / local `opero_test` only.

---

## Phase 7 — Release packaging

### Changed-file inventory (this stabilization commit)

- `apps/worker/src/documents/document-process.processor.ts` — READY material-pending gate
- `apps/api/src/diagnostics/diagnostics.service.ts` — createRun evidence belt
- `apps/api/src/documents/documents.integration.test.ts` — D-P0-003 IT
- `apps/api/src/documents/retention-purge.service.ts` (+ test, module export)
- `packages/diagnostics/src/quality.ts` (+ `quality-b22-identities.test.ts`)
- Docs: this file + ledger / defect register / M10 readiness

### Rollback plan

1. Redeploy prior coordinated service SHAs.  
2. Leave M6 entitlement rows in place (additive) or delete the two plan_entitlement IDs if generate must be revoked on OS plans.  
3. Worker/API READY fixes have no migration reverse.

### Monitoring (rehearsal)

- Document terminal status mix (`READY` vs `REVIEW_REQUIRED`) after extract  
- Diagnostics 400 rate for material-pending belt  
- Publish 403 `ENTITLEMENT_REQUIRED` vs success after mock settle  
- `/ready` + `APP_VERSION` stamp alignment across API/worker/web  
- Retention dry-run candidate counts (ops only; no execute)

### Remaining external blockers

| Blocker | Status |
|---------|--------|
| Korapay Gate C hosted checkout / settlement | **BLOCKED_EXTERNAL** |
| Live OpenAI provider verification | **BLOCKED_EXTERNAL** / optional mock |
| Production SHA skew (D-P1-004) | Cleared only by coordinated deploy of this RC |
| Emergency kill switches | Intentional ON |
| Retention hard-purge policy / legal hold | Owner decision |

### Production restrictions (unchanged)

Do **not**: push, Railway deploy, production migrate, enable uploads/checkout, initiate payments, generate production reports, mutate production financial records, or purchase infrastructure — without separate owner authorization.

### Go / no-go

| Decision | Assessment |
|----------|------------|
| Internal P0 locally resolvable | **Cleared** (D-P0-003/004 local; D-P0-005 already FIXED_LOCAL) |
| Migration readiness | **READY** (additive; isolated verified) |
| API/worker/web compatibility | **READY** as coordinated tip |
| Controlled rehearsal deploy | **GO** (owner authorize) |
| Commercial launch | **NO-GO** until Korapay Gate C (+ optional live AI ops) |

---

## STOP FOR OWNER REVIEW

Local stabilization complete. Awaiting owner authorization for rehearsal deploy, migration apply, and any production promotion.
