# PR2L-B — A12-A2-U Pilot Upload Allowlist Implementation

**Status:** LOCAL IMPLEMENTATION COMPLETE — STOP FOR OWNER REVIEW  
**Date:** 2026-11-16  
**Scope:** Server-side timed upload window restricted to one approved pilot organization  
**Pilot org:** `opero-live-pilot` (`6693e901-9051-49bc-82a6-20094835432c`)  

**Not done in this step:** push, deploy, production variable changes, enabling uploads, report creation, checkout / LIVE_PILOT, Korapay, staging/rehearsal, Increment C.

---

## 1. Summary

Implemented an API-enforced pilot upload allowlist that:

1. Always rejects uploads when `EMERGENCY_DISABLE_UPLOADS=true` (global kill switch precedence).
2. When `PILOT_UPLOAD_ENABLED=true`, allows **only** `PILOT_UPLOAD_ORG_ID` before `PILOT_UPLOAD_EXPIRES_AT` (server clock).
3. Rejects wrong org, missing/invalid config, and expired windows.
4. Leaves existing auth / membership / `xray:write` / ClamAV / prefix isolation unchanged.
5. Does **not** create payment entitlements or touch checkout.

Production boot now refuses `EMERGENCY_DISABLE_UPLOADS=false` unless `PILOT_UPLOAD_ENABLED=true` (timed org allowlist required to open uploads).

---

## 2. Changed files

| Path | Change |
|------|--------|
| `apps/api/src/documents/pilot-upload-gate.ts` | **New** — `assertPilotUploadAllowed`, `pilotUploadWindowOpen` |
| `apps/api/src/documents/pilot-upload-gate.test.ts` | **New** — unit tests for precedence, expiry, org match |
| `apps/api/src/documents/a12-pilot-upload-allowlist.integration.test.ts` | **New** — HTTP integration: emergency, allowlist, wrong org, expiry, unauth, boot rules |
| `apps/api/src/documents/documents.service.ts` | Call `assertPilotUploadAllowed` at start of `createUpload` (before size/storage) |
| `apps/api/src/config/env.ts` | `PILOT_UPLOAD_ENABLED` / `ORG_ID` / `EXPIRES_AT` + `superRefine` boot guards |
| `apps/api/src/config/env.test.ts` | Defaults + invitation-only prod keeps emergency uploads true |
| `apps/api/src/health/ops.controller.ts` | `ops/status.pilotUpload` (`enabled`, `orgConfigured`, `expiresAt`, `windowOpen`) |
| `apps/worker/src/documents/document-process.processor.ts` | Comment only: API gates initiation; authorized in-flight jobs may finish after window expiry |

**No database migrations.** Configuration is env-only.

---

## 3. Gate behavior

Order of checks in `assertPilotUploadAllowed` (called from `DocumentsService.createUpload` with path-bound `organizationId`):

| # | Condition | Result | Code |
|---|-----------|--------|------|
| 1 | `EMERGENCY_DISABLE_UPLOADS=true` | Reject | `EMERGENCY_DISABLE_UPLOADS` |
| 2 | `PILOT_UPLOAD_ENABLED=false` | Allow (auth/permissions still apply; staging/dev) | — |
| 3 | Enabled but missing org or expiry | Reject | `PILOT_UPLOAD_NOT_CONFIGURED` |
| 4 | `now >= PILOT_UPLOAD_EXPIRES_AT` | Reject | `PILOT_UPLOAD_EXPIRED` |
| 5 | Path org ≠ `PILOT_UPLOAD_ORG_ID` | Reject | `PILOT_UPLOAD_FORBIDDEN` |
| 6 | Else | Allow upload initiation | — |

Upstream (unchanged):

- `SessionAuthGuard` — unauthenticated denied (401/403 CSRF depending on cookie state).
- `OrgMembershipGuard` — membership required; no client org substitution into storage keys.
- `PermissionsGuard` + `xray:write` — upload permission required.
- Storage keys remain `org/{organizationId}/docs/...`.

Production env validation:

- `PILOT_UPLOAD_ENABLED=true` ⇒ `PILOT_UPLOAD_ORG_ID` (UUID) and `PILOT_UPLOAD_EXPIRES_AT` (ISO-8601) required.
- Production + `EMERGENCY_DISABLE_UPLOADS=false` + `PILOT_UPLOAD_ENABLED=false` ⇒ **boot failure**.

---

## 4. Worker / processing

| Concern | Handling |
|---------|----------|
| Unauthorized uploads entering processing | Blocked at API `createUpload` — no upload row / no enqueue |
| Jobs already authorized before expiry | Worker continues; comment documents intentional finish-after-window |
| Emergency controls | Initiation still gated by API; worker retains tenant job context + prefix checks |
| Cross-tenant processing | `assertTenantJobContext`; job/document lookup scoped by `organizationId`; quarantine key must start with `org/{organizationId}/` |
| ClamAV | Unchanged — mandatory scanner path retained |
| Bucket mappings | **Unchanged** (A11-S1c shared physical bucket residual remains) |

---

## 5. Storage security (verified posture; no remap)

| Control | Status |
|---------|--------|
| ClamAV mandatory | Retained |
| Quarantine private | Retained (private bucket ACL / no public objects) |
| Documents / reports private | Retained |
| Prefix isolation `org/{id}/…` | Enforced on API + worker |
| Public object access | Not introduced |
| Upload ⇒ payment entitlement | **No** — upload path does not issue entitlements; checkout remains separately gated |
| Physical bucket remap | **Not changed** (quarantine/reports still share documents bucket per A11-S1c) |

---

## 6. Security tests

### Unit — `pilot-upload-gate.test.ts`

- Global kill switch blocks even when pilot window open.
- Pilot flag disabled → gate allows (emergency off).
- Missing config / expired window / wrong org rejected.
- Allowlisted org within window accepted.
- `pilotUploadWindowOpen` false under emergency or disabled flag.

### Integration — `a12-pilot-upload-allowlist.integration.test.ts`

- Allowlisted org accepted during window (`PILOT_UPLOAD_ENABLED=true`, emergency off).
- Wrong organization → `PILOT_UPLOAD_FORBIDDEN`.
- `EMERGENCY_DISABLE_UPLOADS=true` blocks allowlisted uploads (precedence).
- Expired `PILOT_UPLOAD_EXPIRES_AT` → `PILOT_UPLOAD_EXPIRED`.
- Unauthenticated → 401 or 403.
- Boot: `PILOT_UPLOAD_ENABLED` without org/expiry rejected.
- Boot: production open uploads without pilot allowlist rejected.

### Regression

- `documents.integration.test.ts` — 6/6 pass (pilot flag default off).
- `env.test.ts`, `pilot-controls.integration.test.ts` — pass (checkout remain disabled under emergency).
- Related suite batch: **39 passed**.

### Validation commands (local)

```text
pnpm --filter @opero/api typecheck     # PASS
pnpm --filter @opero/worker typecheck  # PASS
pnpm --filter @opero/api build         # PASS
pnpm --filter @opero/worker build      # PASS
pnpm --filter @opero/api exec vitest run \
  src/documents/pilot-upload-gate.test.ts \
  src/documents/a12-pilot-upload-allowlist.integration.test.ts \
  src/documents/documents.integration.test.ts \
  src/config/env.test.ts \
  src/pilot/pilot-controls.integration.test.ts
```

Checkout / entitlement: unchanged; `EMERGENCY_DISABLE_CHECKOUT` and `LIVE_PILOT_ENABLED=false` remain the payment gates. Uploading does not create Korapay transactions or entitlements.

---

## 7. Runtime configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `EMERGENCY_DISABLE_UPLOADS` | `false` (dev); **prod currently `true`** | Global kill switch — always wins |
| `PILOT_UPLOAD_ENABLED` | `false` | Enable timed org allowlist |
| `PILOT_UPLOAD_ORG_ID` | unset | Approved org UUID (pilot: `6693e901-9051-49bc-82a6-20094835432c`) |
| `PILOT_UPLOAD_EXPIRES_AT` | unset | ISO-8601 expiry (server time) |

Ops visibility (`GET /api/v1/ops/status`, token-gated):

```json
"pilotUpload": {
  "enabled": false,
  "orgConfigured": false,
  "expiresAt": null,
  "windowOpen": false
}
```

`windowOpen` is true only when emergency is off, flag is on, org+expiry configured, and expiry is in the future.

**Do not set these in production until owner-authorized timed-window execution.**

---

## 8. Migration requirements

| Item | Required? |
|------|-----------|
| Prisma / SQL migration | **No** |
| Schema change | **No** |
| Bucket remapping | **No** (explicitly out of scope) |
| Env-only rollout | **Yes** — API (and optionally worker for posture consistency of emergency flag) |

---

## 9. Deployment scope (owner-authorized later)

| Service | Needed for allowlist? | Notes |
|---------|----------------------|-------|
| `opero-prd-api` | **Yes** | Contains gate + env validation + ops status |
| `opero-prd-worker` | Optional | Comment-only; processing policy unchanged |
| `opero-prd-web` | **No** | No UI change in this deliverable |

Deploy order (when authorized): ship API build with allowlist code **while** `EMERGENCY_DISABLE_UPLOADS=true` and `PILOT_UPLOAD_ENABLED=false` (dormant). Open window only via subsequent env change under timed plan.

---

## 10. Timed-window execution plan (owner-authorized only)

**Prerequisites:** API with this code live; pilot identity complete; ClamAV healthy; checkout remain disabled.

1. Confirm ops status: `emergency.disableUploads=true`, `pilotUpload.enabled=false`, `windowOpen=false`.
2. Set (API):
   - `PILOT_UPLOAD_ORG_ID=6693e901-9051-49bc-82a6-20094835432c`
   - `PILOT_UPLOAD_EXPIRES_AT=<ISO end of window>`
   - `PILOT_UPLOAD_ENABLED=true`
3. Set `EMERGENCY_DISABLE_UPLOADS=false` (window open only with steps 2–3; boot requires pilot flag if emergency is false).
4. Verify `ops/status.pilotUpload.windowOpen=true`.
5. Pilot uploads synthetic report for `opero-live-pilot` only.
6. At expiry: API rejects new uploads automatically (no frontend timer). Optional: set `EMERGENCY_DISABLE_UPLOADS=true` and/or `PILOT_UPLOAD_ENABLED=false` for belt-and-suspenders.

**Leave unchanged during window:** `EMERGENCY_DISABLE_CHECKOUT=true`, `LIVE_PILOT_ENABLED=false`, public registration disabled, no Korapay live charges.

---

## 11. Stop conditions

Abort / re-close uploads immediately if any of:

- Non-pilot org can initiate upload.
- Uploads succeed after `PILOT_UPLOAD_EXPIRES_AT`.
- Emergency kill switch fails to block when re-enabled.
- Cross-tenant document access or prefix violation.
- Checkout / LIVE_PILOT / Korapay inadvertently enabled.
- ClamAV unavailable or scanner bypassed.
- Unexpected entitlement or payment issuance from upload.

**Immediate close:** `EMERGENCY_DISABLE_UPLOADS=true` (takes precedence over pilot allowlist).

---

## 12. Rollback

| Layer | Action |
|-------|--------|
| Runtime | Set `EMERGENCY_DISABLE_UPLOADS=true`; set `PILOT_UPLOAD_ENABLED=false` |
| Code | Redeploy previous API image (gate absent; emergency kill switch still present) |
| Data | No migration to reverse; quarantine/docs objects remain under org prefixes |
| Payments | N/A — not touched |

---

## 13. Remaining storage-isolation risks

Unchanged from A12-A2-U preflight / A11-S1c:

1. **Shared physical bucket** — quarantine, clean documents, and reports map to `opero-prd-documents-*`; isolation is **prefix-only**, not separate buckets.
2. **Credential blast radius** — one documents credential set can list/read all prefixes if misused; app-layer tenancy remains the control.
3. **Same-bucket promote** — worker quarantine→documents is a key copy within one bucket (valid, but not cross-bucket separation).
4. **Remap deferred** — pointing `S3_QUARANTINE_BUCKET` / `S3_REPORTS_BUCKET` at dedicated buckets requires separate authorize (not part of A2-U).

Allowlist does **not** worsen or fix these residuals; it only restricts which org may initiate uploads during the timed window.

---

## 14. Owner review checklist

- [ ] Approve API code merge/deploy (dormant: emergency uploads still true, pilot upload flag false).
- [ ] Approve timed-window env values and duration.
- [ ] Confirm stop/rollback contacts.
- [ ] Explicitly authorize any later: upload enablement, synthetic upload execution, report creation, Increment C.

---

## STOP FOR OWNER REVIEW

Local implementation, tests, typechecks, and builds are complete.  
**No push. No deploy. No production env changes. Uploads remain disabled.**
