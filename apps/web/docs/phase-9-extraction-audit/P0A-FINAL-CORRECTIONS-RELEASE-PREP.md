# P0-A Final Corrections & Staging Release Preparation

**Base:** `935eeb0`  
**This commit:** (see git log after commit)  
**Migrations:** **None**  
**Push / deploy:** Not performed — awaiting owner approval

---

## 1. Changed files

### Review interface
- `apps/web/src/components/extraction-line-card.tsx` — “Correct & confirm”, badge for legacy `CORRECTED`
- `apps/web/src/app/organizations/[orgId]/documents/[documentId]/page.tsx` — CONFIRM + filled newValue blocked client-side
- `apps/web/src/lib/extraction-review-presentation.ts` — `CONFIRMED` only; legacy `CORRECTED` in financial review queue
- `apps/web/src/lib/extraction-review-presentation.test.ts`
- `apps/api/src/documents/documents.service.ts` — server-side CONFIRM + `newValue` → 400
- `apps/api/src/documents/documents.integration.test.ts`

### Historical-output protection (no schema change)
- `packages/diagnostics/src/snapshot-integrity.ts` (+ test)
- `packages/diagnostics/src/index.ts`
- `apps/api/src/diagnostics/diagnostics.service.ts` — `integrity` on getRun / getScore
- `apps/api/src/reports/reports.service.ts` — read-time de-verify + disclosure; publish cannot set verified when contaminated

### Docs
- `apps/web/docs/phase-9-extraction-audit/P0A-FINAL-CORRECTIONS-RELEASE-PREP.md`

---

## 2. Review behavior before / after

| Behavior | Before | After |
|----------|--------|-------|
| Correct action label | “Correct value” | **“Correct & confirm”** |
| Legacy `CORRECTED` badge | Success / looks confirmed | Warning **“CORRECTED · Needs re-confirm”** |
| `isConfirmedReview` | CONFIRMED \|\| CORRECTED | **CONFIRMED only** |
| CONFIRM with filled correction field | Silently confirmed old amount | **Blocked** (UI error + API 400) |
| CORRECT without newValue | API 400 | Unchanged (UI also blocks) |
| Draft fields | Not saved until submit | Unchanged |
| Audit / actor / `xray:write` | Preserved | Unchanged (`CORRECT` still audited as `CORRECT`) |

---

## 3. Historical-output protection status

**Implemented without migration or record rewrite.**

- Pure function `assessSnapshotPayloadIntegrity(payload)` flags snapshots where any line has `actualValue` and `reviewStatus ∈ {PENDING, CORRECTED}`.
- Diagnostic `GET …/diagnostics/:id` and score responses include `integrity` (`authoritative`, `code`, `contaminatedLineCount`, `detail`).
- Report detail/version responses include `integrity`; presentation forces `verifiedPublication: false` and appends a fixed disclosure when non-authoritative.
- New publishes also refuse verified publication when the linked snapshot is contaminated.
- Stored metrics, PDFs, and reports are **not** deleted or regenerated.

Staging previously had **0** contaminated SUCCEEDED runs (RO scan in safety audit); protection is preventive + portable to other environments.

---

## 4. Financial integrity (re-verified)

| Rule | Status |
|------|--------|
| PENDING / REJECTED monetary excluded from diagnostic amounts | Pass (unchanged eligibility contract) |
| CONFIRMED eligible enter diagnostics | Pass |
| Legacy CORRECTED excluded | Pass |
| Scale-review-required excluded | Pass |
| Contextual pending does not block material readiness | Pass (`CONTEXTUAL_PENDING` INFO only) |
| AI/reports use diagnostic outputs; contaminated runs not presented as verified | Pass |

---

## 5. Test and build results

| Check | Result |
|-------|--------|
| `@opero/diagnostics` vitest | **65 passed** |
| Web monetary + extraction-review | **19 passed** |
| API readiness / documents / diagnostics integration | **11 passed** |
| Typecheck diagnostics / api / web | **Pass** |
| Docker `Dockerfile.api` | **Pass** (`opero-api:p0a-final`) |
| Docker `Dockerfile.worker` | **Pass** (`opero-worker:p0a-final`) |
| Docker `Dockerfile.web` | **Pass** (`opero-web:p0a-final`) |

---

## 6. Migrations

**None required.** No Prisma schema or enum changes.

---

## 7. Deployment sequence & rollback

### Sequence (after owner approval)

1. Pause worker/web auto-deploy if enabled (avoid API/worker skew).
2. Deploy **opero-api** → health/ready.
3. Deploy **opero-worker**.
4. Deploy **opero-web**.
5. Smoke on isolated synthetic org only (no Netshift FY2024 reprocess):
   - CONFIRM + filled newValue → 400 / UI error  
   - Correct & confirm → `CONFIRMED` + audit action `CORRECT`  
   - Legacy CORRECTED badge / filter  
   - Material PENDING → readiness BLOCKED  
   - Report/diagnostic `integrity.authoritative` on clean E2E run = true  

### Rollback

Redeploy previous API → worker → web. No migration reverse. Integrity presentation returns to prior behavior for contaminated historical rows if rolling back past this commit.

---

## Stop

Payment-entitlement remediation **not started**. Awaiting owner approval to push/deploy.
