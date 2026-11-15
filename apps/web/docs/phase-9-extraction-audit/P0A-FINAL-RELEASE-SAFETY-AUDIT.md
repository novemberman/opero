# P0-A Final Release Safety Audit

**Commit under audit:** `935eeb0`  
**Mode:** Read-only verification (no staging mutation, no push, no deploy)  
**Date:** 2026-11-15  
**Verdict:** **Ready to stage after owner approval**, with three residual risks that should be accepted or patched first (UI label clarity, legacy `CORRECTED` presentation helpers, deploy sequencing).

---

## 1. Correction and confirmation semantics

### Workflow (API)

`POST …/documents/:id/review` (`xray:write` only):

| Action | Requires | Line `reviewStatus` after | Audit |
|--------|----------|---------------------------|--------|
| `CONFIRM` | — | `CONFIRMED` | `extraction_reviews` row + `document.reviewed` audit + access event; `actorUserId` stored |
| `CORRECT` | `newValue` required | **`CONFIRMED`** (P0-A) | Same; review row `action` remains `CORRECT` with previous/new values |
| `REJECT` | — | `REJECTED` | Same; scale flags unchanged |

- Original `rawValue` is never overwritten.
- Draft form fields do not auto-save; submission is explicit (`Save review` → API).
- Empty `CORRECT` without `newValue` → 400.
- Typing a corrected value then submitting **`CONFIRM`** ignores `newValue` and confirms the prior normalized amount (UX footgun — see minimal UI change).

### Authorization

| Role | Can review (`xray:write`) |
|------|---------------------------|
| OWNER / ADMIN / ANALYST | Yes |
| VIEWER | No (403) — covered by documents integration tests |

Session + CSRF required on mutating routes.

### Eligibility after review

| Status | Diagnostic `actualValue` |
|--------|--------------------------|
| `PENDING` | Excluded |
| `CORRECTED` (legacy only) | Excluded |
| `REJECTED` | Line dropped |
| `CONFIRMED` | Included when scale resolved |

### UI label ambiguity — residual risk (Low/Medium)

Current labels:

- Action option: **“Correct value”**
- Button: **“Save review”**
- Badge/`isConfirmedReview`: still treats **`CORRECTED` as confirmed** in `extraction-review-presentation.ts` and `extraction-line-card.tsx` tone

After P0-A, **Correct submits as an explicit confirmation**. Labels do not say so. Counters that call `isConfirmedReview` can still count legacy `CORRECTED` as “confirmed” while diagnostics exclude them.

**Minimal change required (not implemented in this audit):**

1. Rename option to **“Correct & confirm”** (or helper text: “Correcting saves a confirmed value”).
2. Align `isConfirmedReview` / badge success tone to **`CONFIRMED` only**; show legacy `CORRECTED` as “Needs re-confirm”.
3. Optional: if `action=CONFIRM` and `newValue` non-empty, warn or require switching to Correct.

---

## 2. Historical diagnostics and reports

### Can historical outputs contain PENDING-derived amounts?

**Yes, in principle.** Pre-P0-A engines wrote scaled `actualValue` for PENDING-with-known-scale into:

- `diagnostic_input_snapshots.payload.lines[]` (`reviewStatus` + `actualValue`)
- `financial_metrics` / scores / findings derived from that snapshot
- AI interpretations and X-Ray reports that freeze those metric rows

New code does **not** rewrite those rows.

### Staging RO scan (this environment)

| Check | Result |
|-------|--------|
| `diagnostic_runs` SUCCEEDED | **1** (`69ba5e22-…` E2E org) |
| Contaminated SUCCEEDED snapshots (`actualValue` present ∧ `reviewStatus ≠ CONFIRMED`) | **0** |
| E2E snapshot REVENUE lines | Both `CONFIRMED` (run was after human confirm) |
| Live `CORRECTED` line items | **0** |
| Live PENDING mapped monetary | **56** (not yet in a SUCCEEDED contaminated snapshot) |

So **this staging DB currently has no contaminated SUCCEEDED run**, but live unconfirmed lines still exist and would have been at risk under the old engine.

### Safe historical policy (proposed — do not auto-rewrite)

1. **Identify**  
   Read-only query on `diagnostic_input_snapshots.payload.lines`: any line with non-null `actualValue` and `reviewStatus ∈ {PENDING, CORRECTED}` → mark run `integrity=STALE_UNCONFIRMED_INPUTS`. Cascade flag to linked AI runs and X-Ray reports by `diagnosticRunId`.

2. **Present**  
   - API/UI: badge **“Provisional — may include unconfirmed evidence”** on stale runs/reports.  
   - Do **not** delete PDFs or metric rows.  
   - `verifiedPublication` / “authoritative” chrome must be false for stale artifacts (presentation gate; optional follow-up code).

3. **Prevent new authoritative use**  
   - Creating/publishing reports already refuses readiness **`BLOCKED`** (material pending).  
   - After deploy, new diagnostics withhold unconfirmed amounts.

4. **Recompute**  
   - Confirm material lines → **new** diagnostic run → new AI/report versions.  
   - Leave historical run immutable; supersede via new version / new run linkage only.

5. **Netshift**  
   - Do not reprocess FY2024 `206bda53-…` as part of this release.  
   - Fingerprint / RO checks only.

---

## 3. Financial integrity — path coverage

| Path | Uses eligibility / CONFIRMED-only amounts? |
|------|---------------------------------------------|
| `packages/diagnostics` `buildSnapshot` | **Yes** — `evaluateMonetaryEligibility` |
| Worker `diagnostic-run.processor` | **Yes** — calls `buildSnapshot` |
| API `run-diagnostic-job` (test/job mirror) | **Yes** |
| `resolveConcept` / `amountsByPeriod` | **Yes** — prefers CONFIRMED; no PENDING amount fallback once snapshot nulls them |
| Reconciliation `detectEvidenceConflicts` | **Yes** — via `buildSnapshot`; preferred = CONFIRMED |
| Readiness | **Yes** — material pending **blocking** / required |
| BHS `computeScore` | Indirect — only sees metrics from eligible amounts; insufficient → `INSUFFICIENT_DATA` |
| AI interpretation | Metrics/findings/score only — no raw line reload |
| Report `buildPayload` / publish | Metrics only; create/publish refuse readiness `BLOCKED` |
| Documents `actualMonetaryValue` display | **Scaled for UI even if PENDING** — provisional presentation path, **not** diagnostic input |

**No alternate engine path found** that recomputes KPIs from raw PENDING amounts bypassing `buildSnapshot`.

**Incomplete analysis (by design):** `createRun` does not require READY. Unconfirmed amounts are null → incomplete metrics → BHS withheld. Product should continue labeling incomplete results clearly in UI (not a bypass).

---

## 4. Deployment dependencies

### Services that must update

| Service | Required? | Why |
|---------|-----------|-----|
| **opero-api** | **Yes** | Readiness gating, review CORRECT→CONFIRMED, reconciliation snapshot, report create gate |
| **opero-worker** | **Yes** | Production diagnostic engine / `buildSnapshot` |
| **opero-web** | **Yes (recommended same release)** | Monetary “established” = CONFIRMED; design-system checklist; without web, integrity still holds server-side but UI can mislabel Correct / legacy CORRECTED |

### Not required

| Item | Notes |
|------|-------|
| Database migrations | **None** |
| Environment variables | **None** |
| Postgres/Redis plugins | No change |

### Compatibility / mismatch risk

- API and worker **both** embed `@opero/diagnostics`.  
  - New API + **old worker** → new diagnostics still contaminate until worker updates.  
  - Old API + **new worker** → worker fixed, but readiness may still be non-blocking on old API.  
- **Independent Railway auto-deploys can create that mismatch.** Prefer manual sequential deploy with worker auto-deploy held until API is healthy (existing runbook).

Dockerfiles both `COPY packages` and build workspace filters — confirmed local images build with `935eeb0` tree.

---

## 5. Validation results

| Check | Result |
|-------|--------|
| `@opero/diagnostics` vitest | **61 passed** |
| Web monetary + extraction-review presentation | **19 passed** |
| API readiness / documents / diagnostics integration | **11 passed** |
| `docker build` `Dockerfile.api` → `opero-api:p0a-audit` | **Success** |
| `docker build` `Dockerfile.worker` → `opero-worker:p0a-audit` | **Success** |
| Staging data modified | **No** |
| Push / deploy | **No** |

Coverage relative to request: pending vs confirmed (eligibility tests), correction→CONFIRMED (documents integration), readiness blocking (readiness unit + integration), AI/report dependency on diagnostic outputs (code audit), VIEWER denial (documents integration). Historical eligibility: RO SQL policy + staging scan (0 contaminated SUCCEEDED runs).

---

## 6. Delivery summary

### Remaining financial-integrity risks

1. **Medium — UI semantics:** “Correct value” does not say it confirms; CONFIRM+filled newValue ignores the edit.  
2. **Low — presentation helpers:** `isConfirmedReview` / badge still treat legacy `CORRECTED` as success.  
3. **Medium — deploy race:** worker/API version skew reopens PENDING inclusion until both are on `935eeb0+`.  
4. **Low — historical (general):** other environments may have contaminated SUCCEEDED runs; apply identification/presentation policy before treating old PDFs as authoritative.  
5. **Accepted by design:** display API may still show scaled PENDING amounts as provisional; diagnostics do not use them after deploy.

### Historical-output remediation policy

Identify via snapshot JSON → label stale → block verified/authoritative chrome → recompute on new run after confirmation → never silent rewrite/delete.

### Required service deployments

**API → worker → web** (same commit). No migrations / env changes.

### Exact staging release sequence (after owner approval)

1. Confirm commit `935eeb0` (or follow-up UI patch commit) is the release tip.  
2. Disable or pause **worker** (and ideally web) auto-deploy if enabled.  
3. Deploy **opero-api**; wait `/api/v1/health` + `/api/v1/ready`.  
4. Deploy **opero-worker**; confirm diagnostic jobs process.  
5. Deploy **opero-web**.  
6. Smoke on **isolated synthetic org only** (not Netshift FY2024 reprocess):  
   - PENDING material → readiness `BLOCKED`  
   - CONFIRM → READY → diagnostics amounts present  
   - CORRECT with `newValue` → `CONFIRMED` + audit action `CORRECT`  
   - VIEWER review → 403  
7. Optional RO: re-run contaminated-snapshot SQL; apply stale labels if any appear in other orgs.  
8. Do **not** start payment-entitlement remediation in this release.

### Rollback plan

1. Redeploy previous API, then worker, then web images/commits.  
2. No DB migration to reverse.  
3. Historical rows remain; behavior returns to pre-P0-A PENDING inclusion — communicate that risk if rolling back after users confirmed under new rules.

---

## Stop

**No push. No deploy. No payment-entitlement work.**  
Awaiting owner approval to release `935eeb0` (and optional minimal UI label patch) to staging.
