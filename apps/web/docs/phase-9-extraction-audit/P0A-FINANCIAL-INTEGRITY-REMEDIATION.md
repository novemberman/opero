# P0-A Financial Integrity Remediation

**Status:** Implemented locally — awaiting owner approval (no push / no deploy)  
**Date:** 2026-11-15  
**Does not begin:** payment-entitlement remediation

---

## 1. Root cause

**Primary defect:** `buildSnapshot` (`packages/diagnostics/src/snapshot.ts`) only withheld `actualValue` when `unitScaleRequiresReview && reviewStatus ∉ {CONFIRMED, CORRECTED}`. **PENDING monetary lines with a known scale received a full scaled `actualValue`.**

**Amplifier:** `resolveConcept` / `amountsByPeriod` preferred CONFIRMED/CORRECTED but **fell back to PENDING** when no preferred line existed.

**Readiness gap:** `reviews_complete` was `required: false` and `PENDING_REVIEWS` was non-blocking, so pending material figures never produced `BLOCKED`. Report publish only refuses `BLOCKED`.

**Downstream:** AI and PDF report builders consume **only** diagnostic run outputs (metrics/findings/score). Contamination happened at snapshot/engine time, then propagated.

**Tests that locked the bug:** `snapshot.test.ts` asserted PENDING → `144000000`; readiness tests expected pending → `ACTION_REQUIRED` not `BLOCKED`.

---

## 2. Eligibility contract (authoritative)

A monetary line contributes `actualValue` to diagnostics **only if** `evaluateMonetaryEligibility` passes:

1. Mapped supported concept (`≠ UNMAPPED`)
2. `quantityClass === MONETARY` (missing class defaults to MONETARY for legacy rows)
3. `reviewStatus === CONFIRMED`  
   - **CORRECTED alone is not approval**  
   - `CORRECT` API action now sets **CONFIRMED** (correction remains an explicit human approval of the new value; audit row still records action `CORRECT`)
4. Valid resolved unit scale (`ACTUAL` | `THOUSANDS` | `MILLIONS`)
5. `unitScaleRequiresReview` is false
6. Org / statement / period scoping remains the caller's responsibility when loading lines

**Excluded from amounts:** PENDING, CORRECTED (legacy), REJECTED, UNMAPPED, non-monetary, scale-unresolved.

Module: `packages/diagnostics/src/eligibility.ts`.

---

## 3. Implementation changes

| Area | Change |
|------|--------|
| Snapshot | Eligibility-gated `actualValue`; warnings for withheld unconfirmed amounts |
| Concepts / reconciliation | Prefer CONFIRMED only; no PENDING fallback into KPIs |
| Quality | Review weight: CONFIRMED=1; CORRECTED/PENDING=0 |
| Readiness | Material monetary pending → **blocking** / `reviews_complete` **required**; contextual (UNMAPPED/non-monetary) pending → INFO only |
| Readiness service | Counts material vs contextual pending using eligibility helpers |
| Document review | `CORRECT` → `CONFIRMED` |
| Statement metadata | `confirm: true` sets statement `reviewStatus=CONFIRMED`; invalidating edits reset to `PENDING` |
| Web monetary UI | Established amounts require `CONFIRMED` |
| Design-system fixture | Matches blocking reviews checklist |

**Not rewritten:** historical Netshift / customer line values. Legacy `CORRECTED` rows simply stop contributing until re-confirmed. Prior synthetic staging reports remain historical artifacts, not proof of the new behavior.

---

## 4. Readiness & score behavior

- **READY** requires zero material unconfirmed monetary figures.
- Incomplete analysis can still run a diagnostic job; unconfirmed amounts are null → metrics mostly `INSUFFICIENT_INPUTS` → BHS `INSUFFICIENT_DATA`.
- Publication remains blocked when readiness is `BLOCKED` (material pending now causes that).

---

## 5. Regression tests

`packages/diagnostics/src/eligibility.test.ts` covers all 12 acceptance cases.

| Suite | Result |
|-------|--------|
| `@opero/diagnostics` vitest | **61 passed** |
| `@opero/document-processing` vitest | **56 passed** |
| Web `monetary-presentation.test.ts` | **7 passed** |
| API readiness / documents / statements / diagnostics integration | **13 passed** |
| `@opero/diagnostics` + `@opero/api` typecheck | **pass** |

---

## 6. Migration requirements

**None.** No Prisma schema changes. Behavior is code-path only.

Optional ops note after deploy: any org relying on PENDING-with-known-scale diagnostics must confirm material lines (or re-run CORRECT/CONFIRM) before READY / scored publications.

---

## 7. Staging deployment & rollback plan

**Do not deploy until owner approval.**

### Deploy (after approval)

1. Push commit to the release branch used by staging.
2. Deploy API first (eligibility lives in `@opero/diagnostics` used by API + worker), then worker, then web.
3. Smoke on isolated synthetic org only — **do not reprocess Netshift FY2024 `206bda53-…`**.
4. Verify: PENDING monetary → readiness `BLOCKED`; after CONFIRM → diagnostics amounts present; BHS scores only on confirmed evidence.

### Rollback

1. Redeploy previous API/worker/web images/commit.
2. No DB migration to reverse.
3. Historical runs retain their stored snapshots; new runs under rollback restore prior PENDING-inclusion behavior.

---

## 8. Stop

Payment-entitlement remediation **not started**. Awaiting owner approval of this integrity fix.
