# M2-P4 FINANCIAL STATEMENT READINESS RECONCILIATION

**Date:** 2026-11-17  
**Verdict: PASS (local)**  
**Release candidate SHA:** `eccef004970394cab3d60189687912495c76dfde`  
**Production access:** READ-ONLY (no mutations / push / deploy / diagnostics)

---

## Optional PPE review finding

| Item | Finding |
|------|---------|
| Concept | `UNMAPPED` — Property plant and equipment |
| Value | `400000` NGN ACTUAL (matches fixture; `previous_value = new_value`) |
| Evidence | **Present** — `evidence_references.snippet` `Property plant and equipment=400,000` row 15 |
| Reviewer | Pilot OWNER (`pilot@opero.coworkxspace.com`) |
| Integrity exception? | **No** — optional confirm with source evidence; not a material readiness blocker (`UNMAPPED` excluded from `materialMonetaryNeedsConfirmation`) |

18/18 mapped monetary confirms remain the readiness gate; PPE is optional inventory.

---

## Review integrity (production read-only)

| Check | Result |
|-------|--------|
| Mapped monetary CONFIRMED | **18** |
| Mapped monetary PENDING | **0** |
| Reviews / distinct lines | **19 / 19** (18 mapped + PPE) |
| Value corrections | **0** (`previous_value` always equals `new_value`) |
| Non-OWNER actors | **0** |
| Revenue fixture match | **PASS** `1250000` NGN ACTUAL |

---

## Readiness root cause

**Two-layer gap (not a missing human confirm):**

1. **Production API still runs `bc1567a`**, which predates `reconcileDocumentReviewStatus`. Confirms persist, but the document badge stays sticky `REVIEW_REQUIRED` / job `REVIEW_REQUIRED` / extraction `MANUAL_REQUIRED`.
2. **Even with reconcile-on-review alone**, a statement that already finished all material confirms **before** an API deploy would never flip until another review POST. Status polls (document page) did not re-derive badge from persisted line evidence.

`MANUAL_REQUIRED` here is the extraction-status twin of incomplete material review — not OCR failure. UNMAPPED PPE does **not** keep material pending.

---

## Local correction

| Change | Purpose |
|--------|---------|
| Call `reconcileDocumentReviewStatus` from `status()` | Evidence-derived, idempotent promotion on poll |
| Audit `document.review_status_reconciled` when status actually changes | Traceable transitions; no spam when unchanged |
| Keep reconcile after `review()` | Immediate flip on last material confirm |
| Material gate unchanged | Still `materialMonetaryNeedsConfirmation` only — no blanket READY |

### Exact changed files

- `apps/api/src/documents/documents.service.ts`
- `apps/api/src/documents/documents.integration.test.ts`
- `apps/web/docs/opero-master-completion/M2-P4-READINESS-RECONCILIATION.md`
- `apps/web/docs/opero-master-completion/MASTER-EXECUTION-LEDGER.md`
- `apps/web/docs/opero-master-completion/DEFECT-REGISTER.md`

---

## Diagnostic eligibility assessment

| Rule | Assessment |
|------|------------|
| Accept only validated monetary inputs | **PASS** — eligibility withholds unconfirmed / scale-blocked values |
| Missing ≠ zero | **PASS** (existing eligibility / snapshot tests) |
| Currency + scale | **PASS** — confirmed ACTUAL NGN on pilot lines |
| Unsupported metadata not required | **PASS** — UNKNOWN statement-type / soft scale confidence do not block material confirms |
| Incomplete statements | **PASS** — partial confirms keep `REVIEW_REQUIRED`; diagnostics readiness blocks on material pending |
| Source lineage | **PASS** — raw values + evidence preserved; reviews audited |

No production diagnostics executed.

---

## Test results

| Suite | Result |
|-------|--------|
| `documents.integration` (8) | **PASS** — includes new reconcile / idempotent status / optional PPE / cross-tenant suites |
| `@opero/diagnostics` eligibility + readiness | **17 PASS** |
| API typecheck | **PASS** |

Covered locally: fully confirmed → READY; partial → REVIEW_REQUIRED; sticky badge repaired by status GET; optional PPE non-blocking; duplicate CONFIRM safe; cross-tenant denial (existing).

---

## Deployment / migration / rollback

| Item | Plan |
|------|------|
| Migrations | **None** |
| Scope | **API-only** (web already has Confirm + visibility tips) |
| After deploy | Owner opens document → status poll should promote to **READY** / extraction **SUCCEEDED** without re-confirming |
| Rollback | Redeploy previous API SUCCESS `bc1567a…` (`284557e2-…`); badge may return to sticky REVIEW_REQUIRED; line confirms remain |
| Acceptance | Read-only: `processing_status=READY`, `extraction_status=SUCCEEDED`, confirmed counts unchanged, no new payments/reports |

---

## Remaining blockers

1. Owner-authorized **API deploy** of this RC (not done).
2. Post-deploy read-only acceptance that pilot doc flips to READY.
3. Separate authorize for **diagnostics run** (M3).
4. Emergencies / upload window remain closed (intentional).

---

## Verdict

**PASS (local)** — review integrity OK; PPE optional with evidence; readiness sticky because prod API lacks evidence-derived reconcile; local fix makes `status()` idempotently promote when material confirms are complete.

**STOP FOR OWNER REVIEW** at the release boundary (no push/deploy).
