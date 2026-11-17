# M2-P2 CONFIRMED FIGURE VISIBILITY

**Date:** 2026-11-17  
**Verdict: PASS (local)**  
**Release candidate SHA:** *(stamped after local commit)*  
**Production:** unchanged (no deploy)

No push, deploy, production mutations, uploads/checkout enablement, reports, or payments.

---

## Root cause

**Frontend filter default — not a backend deletion.**

- API `GET …/extractions` still returns confirmed Revenue (`reviewStatus=CONFIRMED`, value `1250000`, NGN, ACTUAL) after M2-P1.
- Extracted Figures defaulted to filter `needs_financial_review` (“Needs financial review”), which **intentionally excludes** `CONFIRMED` / `REJECTED` rows so operators see only the pending monetary queue.
- After Confirm → server reload, Revenue left that filter and appeared to “disappear,” even though it remained in the full inventory under “All extracted items.”

No pagination/caching bug; no financial-record mutation from this UX issue.

---

## Fix (local)

1. Default filter → **All figures** (`all`).
2. Add explicit **Confirmed** filter.
3. Rename pending queue label → **Pending review** (same `needs_financial_review` id / semantics).
4. After successful confirm/correct/reject, steer the board to **All figures** via `preferredFilter`.
5. Clearer success copy: figure confirmed **and kept in the inventory**.
6. Totals show extracted / confirmed / pending so the inventory count stays obvious when pending decreases.

### Exact changed files

| Path | Change |
|------|--------|
| `apps/web/src/lib/extraction-review-presentation.ts` | Default `all`; add `confirmed` filter; labels |
| `apps/web/src/lib/extraction-review-presentation.test.ts` | Default/visibility/pending-count regressions |
| `apps/web/src/lib/extraction-review-submit.ts` | Success message keeps inventory language |
| `apps/web/src/components/extraction-review-board.tsx` | Filter UX, preferredFilter, copy |
| `apps/web/src/app/organizations/.../documents/[documentId]/page.tsx` | preferredFilter after submit |
| `apps/web/src/app/design-system/review-confirm/page.tsx` | Board-based specimen + inventory counts |
| `apps/web/e2e/review-confirm.spec.ts` | Confirm → visible CONFIRMED; pending vs confirmed filters |
| `apps/web/docs/opero-master-completion/M2-P2-CONFIRMED-FIGURE-VISIBILITY.md` | This report |

---

## Before / after

| Behavior | Before | After |
|----------|--------|-------|
| Default view | Pending monetary only | **All figures** |
| After Confirm Revenue | Dropped from default list | Stays visible as **CONFIRMED** |
| Pending queue | Default | Explicit **Pending review** tab |
| Confirmed queue | Only via “All” | Explicit **Confirmed** tab |
| Pending count | Decreased (hidden) | Decreases while **total extracted unchanged** |
| Success message | “Figure confirmed…” | “…kept in the inventory…” |

Cards still show review status, normalized value, currency, scale, and original evidence snippet. No API contract / audit / value changes.

---

## Test results

| Suite | Result |
|-------|--------|
| Web vitest | **99 passed** (20 files) |
| Web typecheck | **PASS** |
| Web `next build` | **PASS** |
| Docker Chromium Playwright | **3 passed** (Confirm+visibility, 401, duplicate-click) |
| API `documents.integration` | **7 passed** (CONFIRM persist + cross-tenant deny unchanged) |

---

## Deployment requirements

- **Web-only** deploy of the release-candidate tip (after owner authorize).
- **No** API/worker deploy, migrations, or env changes required for this visibility fix.
- Production already holds confirmed Revenue; deploying this web tip restores inventory visibility without re-confirming.

---

## Remaining risks

| Risk | Notes |
|------|-------|
| Operators who preferred pending-first default | Pending review remains one click away |
| Full review-history timeline UI | Still summary + evidence on card; org `extraction_reviews` not listed inline |
| Prod still on `e7e41b7` until authorize | Confirmed Revenue stays hidden under old pending default until web promote |

---

## Recommendation

Authorize a controlled **web-only** promotion of this tip when ready, then hard-refresh the pilot document — Revenue should appear under All figures / Confirmed without further confirmations.

**STOP FOR OWNER REVIEW.**
