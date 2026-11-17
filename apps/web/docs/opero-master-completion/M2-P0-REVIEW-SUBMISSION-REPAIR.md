# M2 P0 — Review Submission Repair (Release Candidate)

**Verdict: PASS (local) / BLOCKED (Playwright host libs + production deploy)**  
**Date:** 2026-11-17  
**Local tip SHA (after this change set):** *(see git commit below)*  
**Production web still:** `f59e65e6f220f96f58d08868a75aaa4d91bc384a` (dropdown + “Submit review”)

---

## Root cause

Production evidence (R4J-A / one-figure diagnostic): **0 review POSTs**.

On **production web `f59e65e`**, confirmation requires:

1. Action select = Confirm  
2. Separate **Submit review** click  

Owner sessions loaded the document (GETs) but never issued `POST …/review`. Backend persistence was already correct (local API integration tests PASS).

**This is a frontend submission UX / operator-path defect, not a silent DB write failure.**

---

## Repair implemented (local)

Single submission path:

1. Primary **Confirm figure** button → `submitExtractionReview` → authenticated `POST /review` (CSRF + cookies).  
2. Advanced Correct/Reject remains a secondary explicit form.  
3. Success UI only after server returns `lineItem` with `reviewStatus`.  
4. Saving / success / failure alerts; submitting disables the button; `beforeunload` while in flight.  
5. Clear 401 session-expired messaging.  
6. Document page CTA keeps review on-page (`#extracted-figures`).  
7. Backend already reconciles `REVIEW_REQUIRED` → `READY` when material confirms complete (prior local commit).

### Changed files (this RC + prior M2 commits on branch)

| Path | Change |
|------|--------|
| `apps/web/src/lib/extraction-review-submit.ts` | Shared submit/validate/classify contract |
| `apps/web/src/lib/extraction-review-submit.test.ts` | Unit coverage |
| `apps/web/src/lib/extraction-review-confirm.contract.test.ts` | Contract E2E (POST issuance) |
| `apps/web/src/components/extraction-line-card.tsx` | One-click Confirm figure |
| `apps/web/src/components/extraction-line-card.browser.test.tsx` | happy-dom click / disable tests |
| `apps/web/src/components/extraction-review-board.tsx` | `onSubmitReview` wiring |
| `apps/web/src/app/organizations/.../documents/[documentId]/page.tsx` | Submit helper, saving banner, beforeunload |
| `apps/web/src/app/design-system/review-confirm/page.tsx` | Interactive E2E specimen |
| `apps/web/e2e/review-confirm.spec.ts` | Playwright specs (host-blocked here) |
| `apps/web/playwright.config.ts` | Playwright config |
| `apps/web/package.json` | `test:e2e` scripts + test deps |
| `apps/api/src/documents/documents.service.ts` | Status reconcile (prior) |
| `apps/api/src/documents/documents.integration.test.ts` | CONFIRM + cross-tenant (prior) |

---

## Test evidence (executed)

| Suite | Result |
|-------|--------|
| `@opero/web` vitest | **97 passed** (20 files) |
| happy-dom Confirm click → CONFIRM payload | **PASS** |
| Contract E2E: CSRF + POST body for Revenue id | **PASS** |
| Web `typecheck` | **PASS** |
| Web `next build` | **PASS** |
| API `documents.integration` CONFIRM + CSV review | **PASS** (2) |
| API `typecheck` | **PASS** |
| `@opero/diagnostics` | **65 passed** |
| Playwright Chromium E2E | **BLOCKED** — host missing `libnspr4` etc.; no sudo to install deps. Specs present under `apps/web/e2e/`. |

No fabricated PASS for Playwright.

---

## Migrations

**None.** No schema changes.

---

## Deployment scope (requires owner authorize)

1. Push local commits (not done).  
2. Deploy **web** (required) + **api** (recommended — status reconcile). Worker optional.  
3. Set matching `APP_VERSION`.  
4. Keep emergencies on.  
5. Owner one-figure Revenue confirm; verify Network `POST …/review` → 201.  

### Rollback

Redeploy previous web (`f59e65e`) / api (`bc1567a`) Railway successes. No migration rollback.

---

## Production verification procedure

1. Open pilot document as OWNER.  
2. DevTools → Network filter `review`.  
3. Click **Confirm figure** on Revenue (`f6da2815-5e54-461c-ae35-0fed50d020d1`).  
4. Expect `GET /auth/csrf` then `POST …/review` **201** with `reviewStatus: CONFIRMED`.  
5. Hard refresh → Revenue still CONFIRMED; other 17 PENDING.  
6. Read-only SQL: one `extraction_reviews` CONFIRM by OWNER; `document.reviewed` audit present.

---

## Remaining risks

| Risk | Notes |
|------|-------|
| Prod still on old UX until deploy | One-figure diagnostic will keep FAIL |
| Playwright not run on this host | CI image with browser deps required |
| Sticky READY semantics for incomplete confirms | Mitigated by material-pending reconcile |

---

## Recommended next owner phrases

- `AUTHORIZE OPERO CONFIRM-UX PRODUCTION DEPLOY`  
- Then re-run one-figure diagnostic verification  

**STOP at production release authorization boundary.**
