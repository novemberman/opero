# PR2L-B — A12-A2-U-R4A Upload Completion Security Hardening

**Verdict: PASS** (local implementation + tests)  
**Date:** 2026-11-16  
**Scope:** Local only — no push, deploy, or production variable changes

---

## 1. Summary

`completeUpload` now re-checks `assertPilotUploadAllowed` (emergency kill switch + pilot org/time allowlist) **before** quarantine `putObject` or worker enqueue.

Already-completed sessions still return **409 Conflict** before the gate (idempotent retries after an emergency flip remain safe).

---

## 2. Exact code changes

| File | Change |
|------|--------|
| `apps/api/src/documents/documents.service.ts` | After load + `consumedAt` check: assert path org = session org; call `assertPilotUploadAllowed` using **stored** `upload.organizationId` and server config; then session TTL / actor / key checks |
| `apps/api/src/documents/pilot-upload-gate.ts` | Comment: gate applies to initiation **and** completion; reject before quarantine/worker |
| `apps/api/src/documents/a12-pilot-upload-allowlist.integration.test.ts` | R4A suite: authorized complete; emergency blocks pending complete; expiry blocks pending complete; wrong org 404; session TTL; concurrent race; no entitlements/payments; no enqueue on reject |

### Completion order (security-relevant)

1. Load `documentUpload` by `uploadId` + path `organizationId`  
2. Missing → 404  
3. `consumedAt` set → **409** (idempotent; **before** gate)  
4. Session org must equal path org  
5. **`assertPilotUploadAllowed`** (emergency → pilot config → server-time expiry → org allowlist)  
6. Session `expiresAt` / actor / quarantine key prefix  
7. Validate buffer → `putObject` quarantine → DB txn + enqueue  

Rejected completions never reach step 7 → **no quarantine object, no processing job**.

### Abandoned / temporary objects

| Surface | Handling |
|---------|----------|
| Multipart body | `memoryStorage()` only — no disk/S3 until `putObject` |
| Gate / auth / TTL reject | No object written |
| Size mismatch after put | Existing `deleteObject` cleanup retained |
| Abandoned unconsumed sessions | Expire via `expiresAt`; no worker job; optional later ops GC out of scope |
| In-flight authorized jobs | Worker still finishes after window expiry (unchanged, intentional) |

---

## 3. Security test results

| Suite | Result |
|-------|--------|
| `pilot-upload-gate.test.ts` | PASS |
| `a12-pilot-upload-allowlist.integration.test.ts` (incl. R4A) | PASS |
| `documents.integration.test.ts` | PASS |
| `security.integration.test.ts` | PASS |
| `env.test.ts` + `pilot-controls.integration.test.ts` | PASS |
| API batch | **6 files / 60 tests PASS** |
| Worker vitest | **7 files / 57 PASS** |
| API/worker typecheck | PASS |
| API/worker build | PASS |
| Production startup matrix | **12/12 PASS** |

Covered behaviors:

- Complete succeeds only in authorized window  
- Complete fails after pilot expiry / emergency  
- Wrong org denied (404 session scope)  
- Missing pilot config fail-closed at env parse (same gate)  
- Expired upload session rejected  
- Concurrent completes → one 201 / one 409; job count = document count  
- Rejected completes do not enqueue  
- No payment / entitlement on success or reject  

---

## 4. Migration requirements

**None.** Env/code only.

---

## 5. Deployment scope (when authorized later)

| Service | Needed? |
|---------|---------|
| `opero-prd-api` | **YES** — contains completion gate |
| `opero-prd-worker` | **NO** |
| `opero-prd-web` | **NO** |

Keep dormant: `EMERGENCY_DISABLE_UPLOADS=true`, `PILOT_UPLOAD_*` unset, checkout emergency on, LIVE_PILOT off.

---

## 6. Rollback procedure

```bash
railway redeploy -s opero-prd-api -e production \
  --commit 126d3b0571e12a1c969bce1c377bb5ecd41169fb -y
```

(or prior known-good API image). Keep emergency uploads **true**. No DB rollback.

---

## 7. Remaining risks

| Risk | Status |
|------|--------|
| Pre-`putObject` race (two requests both pass gate, one loses txn) | Pre-existing; loser 409; winner may have written quarantine then txn — rare; not introduced by R4A |
| Shared physical bucket (A11-S1c) | Unchanged WARN |
| Worker finishes jobs after window | Intentional |
| Local changes not pushed | Owner must authorize push/deploy before R4 window open |

---

## STOP FOR OWNER REVIEW

Local R4A hardening is complete and validated.  
**No push. No deploy. Uploads remain disabled.**
