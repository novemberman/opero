# PR2L-B — A12-A2-U-R1 Upload Allowlist Release Security Review

**Verdict: PASS** — safe for **dormant** production release (code only; uploads remain disabled).  
**Date:** 2026-11-16  
**Scope:** Local review, regression, startup compatibility, release candidate prep  
**Pilot org:** `opero-live-pilot` (`6693e901-9051-49bc-82a6-20094835432c`)

**Not performed:** push, Railway deploy, production variable changes, upload enablement, synthetic reports, payments, staging/rehearsal, Increment C.

---

## 1. Verdict summary

| Area | Result |
|------|--------|
| Security review | **PASS** (1 residual note — see §2.8) |
| Production startup compatibility | **PASS** (12/12) |
| Storage review | **PASS** (A11-S1c shared-bucket residual unchanged) |
| Regression / typecheck / build | **PASS** |
| Release candidate | **PASS** — local commit prepared (see §8) |
| Ready to enable uploads | **NO** — separate owner authorize required |

---

## 2. Security findings

### 2.1 Global kill switch precedence — PASS

`assertPilotUploadAllowed` checks `EMERGENCY_DISABLE_UPLOADS` **first**. When true, it throws `EMERGENCY_DISABLE_UPLOADS` before any pilot flag/org/expiry evaluation.

Verified: unit + integration tests; startup matrix with pilot window armed + emergency true still blocks.

### 2.2 Pilot settings cannot bypass kill switch — PASS

`pilotUploadWindowOpen` returns false whenever emergency is true. Ops status `windowOpen` uses the same helper. Arming `PILOT_UPLOAD_*` under `EMERGENCY_DISABLE_UPLOADS=true` does not open uploads.

### 2.3 Trusted server-side organization identity — PASS

- Path param `organizationId` is membership-checked via `OrgMembershipGuard` (DB membership for session user).
- Gate compares that path org to **server env** `PILOT_UPLOAD_ORG_ID` (not client body).
- Storage keys are derived server-side: `org/{organizationId}/docs/...`.
- Non-members get 404 (no existence leak). Cross-tenant upload attempts denied in allowlist + documents integration tests.

### 2.4 Expiration uses server time — PASS

Gate uses `new Date()` (injectable `now` only for tests). No frontend timer dependency. Expired ISO timestamps reject with `PILOT_UPLOAD_EXPIRED`.

### 2.5 Missing / malformed config fails closed — PASS

| Misconfig | Behavior |
|-----------|----------|
| `PILOT_UPLOAD_ENABLED=true` without org or expiry | Boot reject (`parseApiEnv`) |
| Non-UUID org id | Boot reject (zod UUID) |
| Production `EMERGENCY_DISABLE_UPLOADS=false` without pilot allowlist | Boot reject |
| Runtime missing org/expiry if somehow enabled | `PILOT_UPLOAD_NOT_CONFIGURED` |
| Invalid expiry string at runtime | `PILOT_UPLOAD_NOT_CONFIGURED` |

### 2.6 No alternate upload route bypass — PASS

Only upload mutation routes:

- `POST .../documents/uploads` → `createUpload` → **gate applied**
- `POST .../documents/uploads/:uploadId/complete` → requires prior `documentUpload` row (cannot invent sessions)

No other controllers initiate document uploads.

### 2.7 Worker processing path — PASS

- No new enqueue path; worker change is **comment only**.
- Jobs still require tenant job context + `quarantineKey` prefix `org/{organizationId}/`.
- ClamAV remains mandatory in staging/production (`DOCUMENT_SCANNER_DRIVER=mock` forbidden).
- Unauthorized orgs cannot create uploads → cannot enqueue new processing under dormant or allowlisted policy.

### 2.8 Residual: `completeUpload` does not re-check the gate — NOTE (not blocking dormant)

**Finding (LOW):** `completeUpload` does not call `assertPilotUploadAllowed`. An upload **session** created while the window was open can complete until `DOCUMENT_UPLOAD_TTL_MINUTES` (default 30) even if the pilot window later expires, matching the documented “finish authorized work after expiry” stance.

**Emergency nuance:** flipping `EMERGENCY_DISABLE_UPLOADS=true` blocks **new** `createUpload` immediately, but does not abort an already-issued session’s `completeUpload` until that session TTL elapses.

**Why not BLOCKED for dormant RC:**

- Production currently has uploads disabled; no legitimate pending sessions expected.
- Dormant deploy keeps `EMERGENCY_DISABLE_UPLOADS=true` → no new sessions can be created.
- Object put still requires auth, membership, `xray:write`, actor match, org-scoped key.

**Optional follow-up (before timed window open):** re-assert emergency kill switch (and optionally pilot window) inside `completeUpload` for stricter “always reject uploads” semantics. Owner may accept TTL grace as-is.

### 2.9 Checkout / payment controls — PASS (unchanged)

- No edits to `checkout.service.ts` or LIVE_PILOT payment paths.
- Allowlist integration asserts checkout still blocked under `EMERGENCY_DISABLE_CHECKOUT` and zero entitlement grants on upload accept.
- Startup fixture keeps `EMERGENCY_DISABLE_CHECKOUT=true`, `LIVE_PILOT_ENABLED=false`.

---

## 3. Startup compatibility

Parse-only matrix (no network), 12/12 PASS:

| Case | Result |
|------|--------|
| Current prod-like: uploads disabled, allowlist off, missing `PILOT_UPLOAD_*` | Boot OK; kill switch blocks even if pilot armed |
| Pilot disabled + missing vars | Boot OK |
| Valid future window + emergency still true (dormant arm) | Boot OK; `windowOpen=false` |
| Open uploads + valid future window | Boot OK; allowlisted org accepted |
| Expired window config | Boot OK; runtime rejects uploads |
| Open uploads without allowlist | **Fail closed** (boot) |
| Enabled without org / without expiry / bad UUID | **Fail closed** (boot) |
| Worker prod boot without pilot vars | Boot OK |
| Worker with extra `PILOT_UPLOAD_*` / emergency env | Boot OK (unknown keys ignored) |
| Checkout emergency + LIVE_PILOT false | Unchanged |

**Conclusion:** API and worker boot successfully in the current dormant production posture. No new required worker env vars.

---

## 4. Storage review

| Control | Result |
|---------|--------|
| ClamAV mandatory (prod/staging) | **PASS** — mock scanner forbidden at boot |
| Quarantine / docs / reports private | **PASS** — `PutObject` has no public ACL; downloads via authenticated API / short-lived presign GET only |
| Prefix isolation | **PASS** — API + worker enforce `org/{id}/…` |
| Bucket mappings | **PASS** — **unchanged** this release |
| New public storage access | **PASS** — none introduced |
| Shared physical bucket (A11-S1c) | Residual **WARN** (pre-existing); not worsened |

---

## 5. Regression validation

| Suite | Result |
|-------|--------|
| API allowlist unit + integration + documents + env + pilot-controls + security + pilot-invite | **7 files / 63 tests PASS** |
| API ops.controller.test | **1 PASS** |
| Worker vitest (incl. tenant job-context) | **7 files / 57 tests PASS** |
| Startup compatibility matrix | **12/12 PASS** |
| `@opero/api` typecheck | **PASS** |
| `@opero/worker` typecheck | **PASS** |
| `@opero/api` build | **PASS** |
| `@opero/worker` build | **PASS** |

Migrations: **none**.

---

## 6. Release inventory

### 6.1 Exact changed files (RC)

| File | Role |
|------|------|
| `apps/api/src/documents/pilot-upload-gate.ts` | Gate logic |
| `apps/api/src/documents/pilot-upload-gate.test.ts` | Unit tests |
| `apps/api/src/documents/a12-pilot-upload-allowlist.integration.test.ts` | Integration tests |
| `apps/api/src/documents/documents.service.ts` | Invoke gate on `createUpload` |
| `apps/api/src/config/env.ts` | `PILOT_UPLOAD_*` + boot guards |
| `apps/api/src/config/env.test.ts` | Env defaults / prod invitation-only |
| `apps/api/src/health/ops.controller.ts` | `pilotUpload` status block |
| `apps/worker/src/documents/document-process.processor.ts` | Comment only |
| `apps/web/docs/phase-9-extraction-audit/PR2L-B-A12-A2-U-PILOT-UPLOAD-ALLOWLIST-IMPLEMENTATION.md` | Implementation record |
| `apps/web/docs/phase-9-extraction-audit/PR2L-B-A12-A2-U-R1-RELEASE-SECURITY-REVIEW.md` | This review |

Unrelated phase-9 audit markdown and credentials were **excluded** from the RC.

### 6.2 Feature flags

| Flag | Dormant release value | Purpose |
|------|----------------------|---------|
| `EMERGENCY_DISABLE_UPLOADS` | **`true` (keep)** | Global kill switch |
| `PILOT_UPLOAD_ENABLED` | **`false` / unset (keep)** | Timed allowlist off |
| `PILOT_UPLOAD_ORG_ID` | unset | Not required while disabled |
| `PILOT_UPLOAD_EXPIRES_AT` | unset | Not required while disabled |
| `EMERGENCY_DISABLE_CHECKOUT` | **`true` (keep)** | Unchanged |
| `LIVE_PILOT_ENABLED` | **`false` (keep)** | Unchanged |

### 6.3 Required production variables for **dormant** deploy

**No new variables required.** Existing emergency/checkout/pilot registration posture is sufficient.

Do **not** set `PILOT_UPLOAD_ENABLED=true` or `EMERGENCY_DISABLE_UPLOADS=false` in this release step.

### 6.4 Service compatibility / redeploy scope

| Service | Must redeploy? | Why |
|---------|----------------|-----|
| `opero-prd-api` | **YES** | Contains gate, env validation, ops status |
| `opero-prd-worker` | **OPTIONAL** | Comment-only; binary compatible with current worker image |
| `opero-prd-web` | **NO** | No UI change |

API alone is sufficient for dormant allowlist capability. Worker redeploy is cosmetic unless bundling other worker changes later.

### 6.5 Deployment plan (owner-authorized later)

1. Push RC SHA to GitHub (separate authorize).
2. Deploy **API only** (or API+worker) from that SHA.
3. Confirm Railway env still: `EMERGENCY_DISABLE_UPLOADS=true`, `PILOT_UPLOAD_ENABLED` unset/false, checkout emergency true, LIVE_PILOT false.
4. Verify `/api/v1/ops/status`: `emergency.disableUploads=true`, `pilotUpload.enabled=false`, `pilotUpload.windowOpen=false`.
5. Smoke: authenticated upload attempt → rejected with emergency code.
6. **STOP** — do not open the timed window without a separate authorize.

### 6.6 Monitoring / stop conditions (post-deploy dormant)

Monitor:

- API boot success / crash loops after deploy
- `ops/status.pilotUpload.windowOpen` remains `false`
- Unexpected `document.upload_initiated` audit events
- Checkout / Korapay activity remains none for pilot probe

**Immediate stop / rollback triggers:**

- Uploads succeed while emergency disable is true
- `windowOpen=true` without owner authorize
- Checkout or LIVE_PILOT inadvertently enabled
- API fails to boot on production env
- Cross-tenant document access anomalies

### 6.7 Exact rollback plan

| Layer | Action |
|-------|--------|
| Runtime (fastest) | Ensure `EMERGENCY_DISABLE_UPLOADS=true`; `PILOT_UPLOAD_ENABLED=false` |
| Code | Redeploy previous API image (`af0dd97` / last known-good) |
| Worker | No functional rollback required if not redeployed; else prior worker image |
| Data | No migration to reverse |
| Git | Revert RC commit locally/remotely if needed (after push authorize) |

---

## 7. Required owner approvals

Before any further action:

1. **Approve dormant API deploy** of RC SHA (uploads stay disabled).
2. Approve optional worker redeploy (comment-only).
3. **Do not approve** timed-window env changes in the same step.
4. Separate later approve for: open window vars, synthetic upload, report creation, Increment C.

---

## 8. Release candidate

Local commit prepared with **allowlist-only** files (see §6.1).

| Field | Value |
|-------|-------|
| Candidate SHA | `8a4159bdca59f7d0404cacd49ac94c68ec1d1f7f` |
| Short | `8a4159b` |
| Message | `feat(a12): add dormant pilot upload allowlist gate (A12-A2-U)` |
| Branch | `main` (local only — not pushed) |
| Parent | `f59e65e` (web pilot accept page) |

Unrelated audit docs remain untracked/uncommitted.

---

## STOP FOR OWNER REVIEW

**PASS** for dormant release preparation.  
No push. No deploy. No production env changes. Uploads remain disabled.
