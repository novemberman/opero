# M3–M10 INTEGRATED REHEARSAL RELEASE REPORT

**Date:** 2026-11-17  
**Authorization:** `AUTHORIZE OPERO M3-M10 INTEGRATED REHEARSAL RELEASE`  
**Verdict:** **PASS** (controlled rehearsal)  
**Commercial launch:** still **NO-GO** (Korapay Gate C live settlement + live AI unverified)

| Item | Value |
|------|--------|
| Approved / GitHub `main` SHA | `09037c7a48279bf1350ced6dd3dec91a552a3cb7` |
| Stabilization feature SHA | `a27806648dd5f708072dbd58a305f9a1a43f4143` |
| Environment | `korapay-rehearsal` (`701a1707-f204-46e0-8289-e025d37b1853`) |
| Production | **Unchanged** |

---

## Phase 1 — Source / GitHub

| Check | Result |
|-------|--------|
| Local HEAD = approved SHA | **PASS** |
| Ahead of origin (pre-push) | 20 commits; not diverged (`0` behind) |
| Secrets / unrelated tracked churn | **None** (untracked phase-9 docs excluded) |
| Shared packages included | `shared`, `diagnostics`, `ai`, `reports`, `database` migration |
| Push (no force) | **PASS** → `origin/main` = `09037c7a48279bf1350ced6dd3dec91a552a3cb7` |

---

## Phase 2 — Rehearsal preflight

| Check | Result |
|-------|--------|
| Railway project | `opero` / env `korapay-rehearsal` (forked from staging) |
| DB isolation | Rehearsal `Postgres` volume `postgres-volume-TLZ1` ≠ production `Postgres-TwQs` / `postgres-volume-FwZo` |
| Buckets | `opero-rehearsal-documents*` (not production) |
| Backup/recovery | Volume Ready (873MB); Railway Postgres service SUCCESS |
| Prior migrations | **14** (pre-deploy) |
| `EMERGENCY_DISABLE_UPLOADS` | **true** |
| `EMERGENCY_DISABLE_CHECKOUT` | **true** |
| `LIVE_PILOT_ENABLED` | **false** |
| `PUBLIC_REGISTRATION_ENABLED` | set **false** during preflight (was unset→default true) |
| AI | `AI_PROVIDER=mock` (no live OpenAI) |
| Payments | `PAYMENT_PROVIDER=korapay` with **`sk_test_` / `pk_test_`** only (not live); checkout emergency ON |
| Mock settle endpoint | 404 when provider ≠ mock (by design) |

**Preflight: PASS** (sandbox Korapay keys + checkout kill switch substitute for enum `mock`)

---

## Phase 3 — Migration

| Item | Evidence |
|------|----------|
| Migration | `20261117120000_m6_report_generate_entitlement` |
| Applied at | `2026-11-17T08:39:48.129Z` (during API revision that first shipped 15 migrations) |
| Count | **14 → 15**; recorded **exactly once** (no duplicates) |
| Entitlement rows | 2 × `xray.report_generate` on OS plan IDs `…4402` / `…4403` |
| Data integrity | organizations **3**, documents **2** retained |
| Production migrate | **Not run** |

Subsequent API deploy `607b10c0-…` logged: `15 migrations found` / `No pending migrations to apply` / `Migration deploy completed successfully`.

---

## Phase 4 — Coordinated deployment

| Service | Deployment ID | Status | Commit |
|---------|---------------|--------|--------|
| `opero-api` | `607b10c0-7c5d-4da6-9175-f5d8df791a71` | **SUCCESS** | `09037c7…` |
| `opero-worker` | `e4984408-9b17-4d41-8a98-73065613afb2` | **SUCCESS** | `09037c7…` |
| `opero-web` | `b2bdcb19-d138-47e5-8979-436b7ecf3388` | **SUCCESS** | `09037c7…` |

| Health | Result |
|--------|--------|
| API `/api/v1/health` | **ok** |
| API `/api/v1/ready` | **ready** · database/redis/storage **ok** |
| Web `/health` | **ok** |
| Upload shutdown | **active** (`EMERGENCY_DISABLE_UPLOADS`) |
| Checkout shutdown | **active** (`EMERGENCY_DISABLE_CHECKOUT`) |

**Note:** `APP_VERSION` env stamps remain drifted (`6a3f450` / `staging`) — D-P2-003; not the git SHA.

### Production (unchanged)

| Service | Latest SUCCESS |
|---------|----------------|
| `opero-prd-api` | `baa04a73-…` (pre-release) |
| `opero-prd-web` | `e99c8352-…` |
| `opero-prd-worker` | prior SUCCESS retained (no new SUCCESS this gate) |

---

## Phase 5 — Financial intelligence acceptance

Synthetic READY fixtures in rehearsal org `a8c59283-…`:

| Document | Status |
|----------|--------|
| `7d9ccbf4-…` (`opero-e2e-fy2024.pdf`) | READY / SUCCEEDED · 29/29 CONFIRMED |
| `809c1455-…` (`opero-e2e-fy2025.pdf`) | READY / SUCCEEDED · 29/29 CONFIRMED |

| Check | Result |
|-------|--------|
| READY eligibility | **PASS** |
| Diagnostic run `5c08dbd8-…` | **SUCCEEDED** |
| Business Health Score | **SCORED overall 78** · `score.v1` · integrity OK |
| Missing/bad document start | **400** |
| AI interpretation `bf62ab62-…` | **SUCCEEDED** (mock provider) |
| Report draft create + FREE preview lineage | **PASS** (sourceDocumentIds + methodology versions present) |
| Cross-tenant (other real org) | **404** Organization not found |
| Fake org UUID cross-tenant | **500** (audit FK — see security) |

---

## Phase 6 — Billing / entitlement acceptance

| Check | Result |
|-------|--------|
| Draft / review / approve without paid unlock | **PASS** |
| Publish without `xray.report_generate` (new report) | **403** `ENTITLEMENT_REQUIRED` |
| Publish with report-scoped `xray.report_generate` | **200** → `PUBLISHED` (`7ef0199f-…`) |
| PDF without `xray.pdf_download` | **403** `ENTITLEMENT_REQUIRED` |
| PDF with download entitlement | **200** `application/pdf` · 7612 bytes · `%PDF` |
| Checkout emergency | **400** `EMERGENCY_DISABLE_CHECKOUT` |
| Mock settle | **404** (provider is korapay sandbox, not mock) |
| Live charges | **None** |

Payment-redirect-alone / duplicate webhook duplication: not re-exercised live (checkout killed; covered by prior local billing IT). Revocation path exercised via publish denial without generate grant on sibling report.

---

## Phase 7 — Browser acceptance

| Check | Result |
|-------|--------|
| Web smoke `/`, `/pricing`, `/design-system/documents` | **200** |
| Docker Chromium Playwright `v1.56.1-jammy` · `PLAYWRIGHT_BASE_URL=https://opero-web-korapay-rehearsal.up.railway.app` | **5/5 PASS** |
| Host packages | **unchanged** |

Authenticated multi-page tenant browser journey remains deferred (uploads kill switch + invitation-only registration).

---

## Phase 8 — Security / operations

| Check | Result |
|-------|--------|
| Tenant isolation (membership) | **PASS** (404 on foreign org) |
| Registration disabled | **403** `PUBLIC_REGISTRATION_DISABLED` |
| CSRF | Required on mutating routes |
| Report PDF private after entitlement | **PASS** |
| Audit events | Diagnostic/report actions recorded; denied-membership audit can 500 on non-existent org FK |
| Worker | Diagnostic + AI + report jobs completed |
| Emergencies | Uploads + checkout remain ON |
| Monitoring | Health/ready green |
| Rehearsal cost | Mock AI; no live Korapay charge; Railway compute only |
| Production modifications | **None** |

### Security finding (non-blocking for rehearsal PASS)

`OrgMembershipGuard` records `authz.denied` with `organizationId` before verifying the org exists. Requests against **non-existent** org UUIDs can return **500** (`audit_events_organization_id_fkey`) instead of 404. Data is not leaked; recommend fixing audit to omit/null org FK when org missing (follow-up, not this gate).

---

## Remaining blockers

| Blocker | Status |
|---------|--------|
| Korapay Gate C hosted checkout / live settlement | **BLOCKED_EXTERNAL** |
| Live OpenAI verification | **BLOCKED_EXTERNAL** / optional |
| Production SHA skew | Still present until production promotion |
| D-P2-003 APP_VERSION stamp drift | OPEN |
| OrgMembershipGuard audit 500 on missing org | NEW follow-up |
| Retention hard-purge execute | Owner policy (dry-run only) |

---

## Production deployment prerequisites

1. Separate owner authorization for production.  
2. Apply `20261117120000_m6_report_generate_entitlement` on production DB via API preDeploy.  
3. Coordinated API → worker → web at `09037c7…` (or later approved tip).  
4. Keep emergencies / registration / live-pilot posture as owner directs.  
5. Do **not** enable live Korapay until Gate C PASS.  
6. Fix or accept OrgMembershipGuard audit FK behavior before broad traffic.

---

## Rollback (rehearsal)

1. Redeploy prior SUCCESS revisions per service.  
2. M6 entitlement inserts are additive — leave in place or delete the two plan_entitlement rows.  
3. Synthetic acceptance user/grants/report rows are rehearsal-only.

---

## STOP FOR OWNER REVIEW

Rehearsal integrated M3–M10 release **PASS**. Production untouched. Awaiting owner decision on production promotion and external payment/AI gates.
