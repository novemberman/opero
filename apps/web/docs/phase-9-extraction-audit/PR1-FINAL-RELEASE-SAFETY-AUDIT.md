# PR-1 Final Release Safety Audit

**Date:** 2026-11-15  
**Audited base:** `ead9322` + audit corrections (this commit)  
**Verdict:** **APPROVE for Railway staging** with safe defaults (pilot/kill switches unset; registration open as today).  
**Not approved for:** production provision, live payments, Increment C, or enabling closed registration on staging without a rehearsal plan.

---

## Security verdict

| Area | Verdict | Notes |
|------|---------|-------|
| Ops `/api/v1/ops/status` | **Pass (hardened)** | Non-secret payload; optional `OPS_STATUS_TOKEN`; throttled; no per-scrape Redis TCP; sanitized queue errors; `ok`/`degraded` distinguishable |
| Pilot controls | **Pass (hardened)** | Server-side only; advisory locks on user/org caps; invite timing-safe compare; invite-accept respects user cap; kill switches before business logic |
| Legal drafts | **Pass** | Routes + links; draft banner / noindex; placeholders; no clickwrap |
| AuthZ / CSRF / sessions | **Pass** | Security + billing regression green; headers present |
| Mock settle in production | **Pass** | Env forbid mock + APP_ENV=production 404 defense |
| Financial / commercial regression risk | **Low** | Defaults unchanged; no schema migrations; worker code unchanged |

---

## Required corrections applied in this audit

1. **Ops exposure / load**
   - Optional `OPS_STATUS_TOKEN` (Bearer or `X-Ops-Token`) when set; public non-secret scrape when unset (staging default).
   - `@Throttle(30/min)`; Redis probed via BullMQ queue getters (no new connection per request).
   - Queue errors normalized to `probe_failed` (no driver strings).
2. **Pilot races / invite path**
   - `pg_advisory_xact_lock` around user/org cap checks + creates.
   - Timing-safe invite code compare.
   - Invitation-created users also respect `PILOT_MAX_USERS`.
3. **Legal clarity**
   - Stronger “not approved production policy / no click-wrap” banner; `robots: noindex` on `/legal/*`.
4. **Tests**
   - Pilot integration suite + legal navigation tests + ops token test.

---

## Findings accepted (no code change)

| Finding | Rationale |
|---------|-----------|
| Unauthenticated ops when token unset | Intentional for staging scrapers; payload excludes secrets/tenant finance; set `OPS_STATUS_TOKEN` before production |
| `PILOT_MODE` alone does not close registration | By design: requires `PUBLIC_REGISTRATION_ENABLED=false`; production env validation enforces pairing |
| Public marketing still links to `/register` | API enforces closed registration when configured; UI hide is optional follow-up |
| No CSP yet | Deferred pending owner allowlist approval (PR-0/PR-1 noted) |

---

## Test results

| Suite | Result |
|-------|--------|
| API unit (env, configure-app, ops, timing-safe) | Pass |
| API pilot-controls integration | Pass |
| API security + billing integration | Pass (51 tests in combined audit run) |
| Web legal-pages | Pass (4) |
| API / web TypeScript | Pass |
| Docker api / web / worker | Pass (see commit notes) |

---

## Deployment compatibility (staging)

| Item | Requirement |
|------|-------------|
| Services to deploy | **API** and **Web** (this change set). **Worker optional/not required** (no worker code changes). |
| Migrations | **None** |
| New env vars (all optional; safe unset) | `OPS_STATUS_TOKEN`, `PILOT_*`, `PUBLIC_REGISTRATION_ENABLED`, `EMERGENCY_DISABLE_*`, `ENABLE_API_DOCS` |
| Staging safe defaults | Leave new flags **unset** → registration open, no invite code, no caps, kill switches off, ops public non-secret, swagger remains available for staging `APP_ENV` |
| Rollback IDs | API/Web → `cc7041f`; Worker stays `d301cb3` (or current worker SHA if unchanged) |
| Auto-deploy watchPatterns | Confirm API watches `apps/api/**` (+ Dockerfile) and web watches `apps/web/**` (+ Dockerfile). Shared package change (`packages/shared`) must trigger API (and preferably web) rebuild—verify filters include `packages/shared/**` or deploy manually. |

---

## Staging smoke-test plan (post-deploy)

1. `GET /api/v1/health` → 200  
2. `GET /api/v1/ready` → 200  
3. `GET /api/v1/ops/status` → 200, `status` in `ok|degraded`, no secrets in body  
4. Register + login (defaults open)  
5. Open `/legal/terms|privacy|financial-disclaimers|payments` — draft banner visible  
6. Confirm footer + register/login/unlock links  
7. Upload smoke + existing org report path (P0-A integrity untouched)  
8. Mock checkout path still works (kill switches **unset**)  
9. Confirm Swagger still reachable on staging (`APP_ENV=staging`)

---

## Rollback strategy

1. Redeploy API image at `cc7041f`.  
2. Redeploy Web image at `cc7041f`.  
3. Leave Worker at `d301cb3`.  
4. No DB rollback required (no migrations).  
5. If new env vars were set experimentally, clear them to restore prior behavior.

---

## Owner approval gate

**Approve staging deploy of this audit commit** when ready. Do **not** enable `PILOT_MODE` / closed registration / kill switches / `OPS_STATUS_TOKEN` on staging until a rehearsal is scheduled. Do **not** push/deploy/provision production or enable live payments without a separate authorization.
