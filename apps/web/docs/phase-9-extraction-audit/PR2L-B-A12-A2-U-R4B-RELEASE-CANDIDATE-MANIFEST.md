# PR2L-B — A12-A2-U-R4B Completion Hardening Release Candidate Manifest

**Verdict: PASS**  
**Date:** 2026-11-16  
**Authorization used:** Local release preparation only (no push / no deploy)

**Parent / current prod+rehearsal API:** `126d3b0571e12a1c969bce1c377bb5ecd41169fb`  
**Release candidate SHA:** `539e892f65c5a1b1bd5be82a3e862002a05679b3`

---

## 1. Verdict summary

| Area | Result |
|------|--------|
| Source review | **PASS** — R4A-only code + docs |
| Security review | **PASS** |
| Regression validation | **PASS** |
| Packaging | **PASS** — clean local commit |
| Push / deploy | **Not performed** |

---

## 2. Source review

### Changed files (RC inventory)

| Path | Role |
|------|------|
| `apps/api/src/documents/documents.service.ts` | `completeUpload` gate recheck before `putObject` |
| `apps/api/src/documents/pilot-upload-gate.ts` | Comment: gate covers create + complete |
| `apps/api/src/documents/a12-pilot-upload-allowlist.integration.test.ts` | R4A completion security tests |
| `apps/web/docs/phase-9-extraction-audit/PR2L-B-A12-A2-U-R4A-COMPLETION-HARDENING-REPORT.md` | Hardening report |
| `apps/web/docs/phase-9-extraction-audit/PR2L-B-A12-A2-U-R4B-RELEASE-CANDIDATE-MANIFEST.md` | This manifest |

### Confirmed absent from RC

| Check | Result |
|-------|--------|
| Unrelated application changes | **None** |
| Secrets in diff | **None** |
| Unintended configuration / env schema changes | **None** |
| Migrations / Prisma schema | **None** |
| Unrelated phase-9 audit markdown | **Excluded** (remain untracked) |
| Checkout / LIVE_PILOT / payment code edits | **None** |

Upload initiation and payment paths are unchanged except completion now shares the existing allowlist gate.

---

## 3. Security review

| Requirement | Result |
|-------------|--------|
| Emergency shutdown precedence for uncompleted sessions | **PASS** — `assertPilotUploadAllowed` first checks `EMERGENCY_DISABLE_UPLOADS` |
| Org auth from stored session ownership | **PASS** — gate uses `upload.organizationId`; path must match session |
| Expiry uses server time | **PASS** — `new Date()` in gate (+ session `expiresAt`) |
| Rejected completion → no storage object | **PASS** — gate before `putObject` |
| Rejected completion → no worker job | **PASS** — enqueue only after successful txn |
| Concurrent completes cannot bypass gate | **PASS** — tested 201+409; CAS on `consumedAt` |
| Already-completed behavior documented | **PASS** — 409 before gate (idempotent after emergency flip) |
| No cross-tenant access | **PASS** — membership + session org binding |
| No payment / entitlement side effects | **PASS** — tests assert counts remain 0 |

---

## 4. Regression validation

| Check | Result |
|-------|--------|
| API upload/document/security/env/pilot tests | **6 files / 60 PASS** |
| Worker tests | **7 files / 57 PASS** |
| Production startup matrix | **12/12 PASS** |
| `@opero/api` typecheck / build | **PASS** |
| `@opero/worker` typecheck / build | **PASS** |

---

## 5. Release candidate packaging

| Field | Value |
|-------|-------|
| Branch | `main` (local) |
| Feature message | `fix(a12): recheck pilot upload gate on completeUpload (R4A)` |
| Full SHA | `539e892f65c5a1b1bd5be82a3e862002a05679b3` |
| Base | `126d3b0571e12a1c969bce1c377bb5ecd41169fb` (current `origin/main` / prod / rehearsal API) |

Unrelated untracked audit docs were **not** staged.

---

## 6. Rehearsal deployment plan (owner-authorized later)

1. Push RC SHA to GitHub (no force).  
2. Confirm `korapay-rehearsal` still has `EMERGENCY_DISABLE_UPLOADS=true`, checkout emergency true, LIVE_PILOT false, `PILOT_UPLOAD_*` unset.  
3. Redeploy **`opero-api` only** @ RC SHA.  
4. Verify SUCCESS, exact SHA, `/api/v1/health`+`/ready` 200.  
5. Runtime: completeUpload path present; emergency still blocks create+complete; `windowOpen=false`.  
6. Do **not** open upload window in this step.  
7. Worker/web unchanged.

---

## 7. Production deployment prerequisites (later authorize)

| Prerequisite | Status at packaging |
|--------------|---------------------|
| Rehearsal acceptance of RC | Pending owner execute |
| Prod API currently | `126d3b0` dormant |
| Keep `EMERGENCY_DISABLE_UPLOADS=true` | Required |
| Keep checkout emergency / LIVE_PILOT off | Required |
| `PILOT_UPLOAD_*` unset | Required until R4 window authorize |
| Migrations | None |
| Worker/web redeploy | Not required |
| Cost under $235 | Unchanged by this code |

### Rollback

```bash
railway redeploy -s opero-prd-api -e production \
  --commit 126d3b0571e12a1c969bce1c377bb5ecd41169fb -y
# rehearsal:
railway redeploy -s opero-api -e korapay-rehearsal \
  --commit 126d3b0571e12a1c969bce1c377bb5ecd41169fb -y
```

---

## 8. Release candidate SHA

| Field | Value |
|-------|-------|
| Feature (code) SHA | `539e892f65c5a1b1bd5be82a3e862002a05679b3` (`539e892`) |
| Docs stamp SHA | `c2f99cec833c6d47f92d0c3752d00d0cd0ad1e07` (`c2f99ce`) |
| Tip vs feature | Tip may include docs-only stamp/clarify commits; API tree at tip ≡ feature for runtime |
| Ahead of origin | Local only; **not pushed** |

---

## STOP FOR OWNER REVIEW

**PASS** — R4B release candidate packaged locally.  
**Release candidate SHA:** `539e892f65c5a1b1bd5be82a3e862002a05679b3`  
**No push. No deploy. Uploads remain disabled.**
