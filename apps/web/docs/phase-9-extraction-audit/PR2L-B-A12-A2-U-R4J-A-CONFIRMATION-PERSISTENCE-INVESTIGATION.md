# PR2L-B — A12-A2-U-R4J-A Confirmation Persistence Failure Investigation

**Verdict: FAIL (persistence) — root cause identified**  
**Date:** 2026-11-17 (~05:02–05:06 UTC)  
**Authorization used:** Read-only investigation + local test fixtures only  

**Organization:** `6693e901-9051-49bc-82a6-20094835432c` (`opero-live-pilot`)  
**Document:** `cc04b221-06c6-41da-b016-213753ca2a08`  
**Statement:** `e3d2dfeb-d276-4848-813c-40234694b75d`  
**Prior signal:** R4I post-confirmation verification **FAIL** (0/18 CONFIRMED)

**Not performed:** production confirm/correct/reject; DB writes; deployments; migrations; uploads/checkout enablement; reports; payments; privileged force-confirm.

---

## Executive summary

Owner-reported Confirm clicks did **not** persist because **no review mutation requests reached production**.

During the authenticated Opera browser session that loaded this document (≈19:39–19:46 UTC on 2026-11-16), production API logs show **only GETs** (status, extractions, organizations, metadata, auth/me). There were:

- **0** `POST …/documents/{id}/review`
- **0** browser `GET /auth/csrf` (CSRF is fetched only before mutating calls)
- **0** `PATCH …/statements/{id}/metadata`
- **0** `extraction_reviews`, **0** `document.reviewed` audits, **0** `REVIEW` access events

Frontend and backend review contracts **match**. Local integration tests **persist** reviews successfully. This is **not** a silent server-side write failure after a successful Confirm POST.

---

## Phase 1 — Frontend review (production-deployed implementation)

Inspected: `apps/web/src/app/organizations/[orgId]/documents/[documentId]/page.tsx`, `extraction-line-card.tsx`, `extraction-review-board.tsx`, `lib/api.ts`, same-origin proxy helpers.

| # | Question | Finding |
|---|----------|---------|
| 1 | Confirm wired to API mutation? | **Yes** — form `onSubmit` → `onReview` → `apiFetch` POST |
| 2 | Endpoint | `POST /api/v1/organizations/{orgId}/documents/{documentId}/review` (browser uses same-origin `/api/v1/…`, proxied to API) |
| 3 | HTTP method | **POST** |
| 4 | Auth + org context | Session cookie (`credentials: "include"`); CSRF header `x-csrf-token` on non-GET; org/document IDs in path; requires membership + `xray:write` |
| 5 | Additional Save required? | **Yes, relative to the Action dropdown.** Selecting Action=Confirm is **not** enough; owner must click **Submit review**. No separate global Save. |
| 6 | Optimistic UI without persistence? | **No.** Success path sets “Review submitted…” then **reloads** status/extractions from the server. No local `CONFIRMED` paint before response. |
| 7 | Errors displayed or suppressed? | HTTP ≥400 → page-level error Alert. Client validation (CONFIRM with filled correction; CORRECT without value) → error Alert. **Gap:** `onReview` has **no try/catch**; thrown network/CSRF bootstrap errors can become unhandled promise rejections without an Alert. |
| 8 | Refresh of persisted state? | On success, `await load()` re-fetches `/status` + `/extractions`; card badges come from server `reviewStatus`. |

**UX risk (ranked #1 contributor to “I clicked Confirm” without persistence):**

- Action select default label: **Confirm**
- Submit control label: **Submit review**
- Procedure correctly required both; a user can change/leave Action=Confirm and leave without submitting.

`canWrite` gates the form (`OWNER` has `xray:write`). Forms are hidden when write permission is absent — not a silent no-op click on a visible Confirm control.

---

## Phase 2 — Backend review

Inspected: `documents.controller.ts` `POST :documentId/review`, `documents.service.ts` `review()`, `reviewLineItemBodySchema` in `@opero/shared`.

| Concern | Behavior |
|---------|----------|
| AuthN | `SessionAuthGuard` |
| AuthZ | `OrgMembershipGuard` + `PermissionsGuard` + `@RequirePermissions("xray:write")` |
| Body | `{ lineItemId: uuid, action: CONFIRM\|CORRECT\|REJECT, newValue?, newConcept?, reason? }` |
| Persistence | Transaction: `extraction_reviews` insert + `financial_line_items.review_status` → `CONFIRMED` (or `REJECTED`); CONFIRM/CORRECT clear `unitScaleRequiresReview` and set `scaleConfidence=HIGH` |
| Access audit | `document_access_events.action = REVIEW` |
| Domain audit | `audit_events.action = document.reviewed` |
| Validation | CORRECT requires `newValue`; CONFIRM rejects non-empty `newValue` (400) |
| Idempotency | No special idempotency key; repeat CONFIRM creates another review row and keeps CONFIRMED |
| Expected success code | Nest default **201** with `{ lineItem }` (frontend accepts any `< 400`) |

**Contract match:** Frontend POST body and backend schema align. No path/method/action enum mismatch that would explain 0 persisted confirms.

Document `processing_status` is **not** auto-flipped to `READY` by line confirms (known sticky `REVIEW_REQUIRED` behavior). That does **not** explain missing `extraction_reviews`.

---

## Phase 3 — Production diagnostics (read-only)

### Safety (unchanged / closed)

| Control | Value |
|---------|-------|
| API `/ready` | ready; db/redis/storage ok |
| `EMERGENCY_DISABLE_UPLOADS` | `true` |
| `EMERGENCY_DISABLE_CHECKOUT` | `true` |
| `PILOT_UPLOAD_ENABLED` | `false` |
| `PUBLIC_REGISTRATION_ENABLED` | `false` |
| Payments (pilot org) | **0** |
| Diagnostic runs (pilot org) | **0** |

### Current document / review state

| Signal | Observed |
|--------|----------|
| `processing_status` / `extraction_status` | `REVIEW_REQUIRED` / `MANUAL_REQUIRED` |
| Line `review_status` | **PENDING × 19** (18 mapped monetary + PPE UNMAPPED) |
| Mapped CONFIRMED | **0 / 18** |
| `unit_scale_requires_review` | still set (19) |
| `extraction_reviews` (pilot org) | **0** |
| `document_access_events` | **UPLOAD × 1** only (no REVIEW) |
| `audit_events` `%review%` | **0** |

### API request log evidence (post-redeploy window covering owner session)

Browser UA: Opera/Chrome Mac (`OPR/139`) against pilot document.

Observed methods for that UA: **GET only** — `/auth/me`, `/organizations`, org detail, document `/status`, `/extractions`, statement `/metadata`.

**Absent:** any `POST …/review`, any mutating document/statement call, any browser CSRF issue, any 401/403/400 on review (because review was never called).

Route is mounted: logs show `Mapped {/api/v1/organizations/:organizationId/documents/:documentId/review, POST}` at API boot.

### Authorization / validation failure hypothesis

**Rejected.** Failed POSTs would still appear in request-completed logs (as with other 401s). None exist for review.

### Deploy note

API deploy commit meta shows `bc1567a…`; runtime `APP_VERSION` / `/ready.version` still stamped `31749a3…`. Review route and web `onReview` wiring exist on both lineages inspected. Version stamp drift is **not** the persistence failure mode.

---

## Phase 4 — Local reproduction

Ran `@opero/api` `documents.integration.test.ts` filtered to review/Revenue cases:

- **Result:** 2 passed / 4 skipped  
- CONFIRM with `newValue` → **400** (contract guard)  
- CORRECT → **201**, raw evidence preserved, `reviewStatus=CONFIRMED` after re-fetch  

**Conclusion:** Intended API request, persistence, post-refresh state, and audit path work in local fixtures when the POST is actually issued with session + CSRF.

Frontend unit coverage exercises presentation/filters, not a browser E2E click; wiring inspection + API integration are sufficient to show the defect is **not** “POST succeeds but DB ignores it.”

---

## Root cause and ranked hypotheses

### Root cause (confirmed)

**H1 — No review mutation was submitted to the API**  
Owner session loaded the review UI (GETs succeeded under authenticated session) but never completed a successful **Submit review** POST (and never fetched CSRF for a mutation). Persistence layer never ran.

### Secondary / contributing hypotheses

| Rank | Hypothesis | Status |
|------|------------|--------|
| H2 | UX: Action “Confirm” mistaken for completed confirm without **Submit review** | **Likely contributor** (explains H1) |
| H3 | Owner used “Continue to readiness / review” or filters thinking that confirms figures | Possible; GETs only — consistent with navigation/read |
| H4 | Backend persistence bug / transaction rollback after 201 | **Ruled out** (no POST; local persist works) |
| H5 | AuthZ/CSRF rejection on review | **Ruled out** (no failed review POSTs; no CSRF GETs) |
| H6 | Optimistic UI lied | **Ruled out** (no optimistic CONFIRMED) |
| H7 | Frontend/backend contract mismatch | **Ruled out** |
| H8 | Uncaught client exception before `fetch` | Possible in general (missing try/catch) but **no CSRF GET** implies submit handler likely never reached `apiFetch` |

---

## Is a code fix required?

**Not required to explain or unblock persistence** — the production path works when `POST /review` is issued.

**Optional smallest safe UX/hardening corrections** (separate authorize + deploy; do **not** ship under this investigation):

1. Rename submit control to reflect action (e.g. **Confirm figure** when Action=CONFIRM), or replace dropdown+submit with an explicit primary **Confirm** button.  
2. Wrap `onReview` in `try/catch` and surface `setError(...)`.  
3. Disable the submit button while the request is in flight; clear success only after reload shows `CONFIRMED`.

No schema/migration/backend contract change is indicated for this failure.

---

## Phase 5 — Owner-operated one-figure diagnostic procedure

**Do not execute until owner approval.**  
**Approval phrase required:**

`AUTHORIZE A12-A2-U-R4J-A ONE-FIGURE CONFIRM DIAGNOSTIC`

### Scope

Confirm **exactly one** mapped monetary figure — **Revenue** — then stop for read-only verification.

| Field | Value |
|-------|-------|
| Page | `https://opero-prd-web-production.up.railway.app/organizations/6693e901-9051-49bc-82a6-20094835432c/documents/cc04b221-06c6-41da-b016-213753ca2a08` |
| Concept | `REVENUE` / label **Revenue** |
| Line item id | `f6da2815-5e54-461c-ae35-0fed50d020d1` |
| Expected scale | ACTUAL (×1 NGN); statement units `1250000` |
| Action | **Confirm** |
| Corrected statement units | **Leave blank** |
| Control to click | **Submit review** (not merely selecting Confirm) |

### Steps

1. Owner sends the exact approval phrase above.  
2. Owner logs in as pilot OWNER only (agent must not receive credentials).  
3. Open the document URL; verify badges `REVIEW_REQUIRED` / `CLEAN` / `MANUAL_REQUIRED`.  
4. Open DevTools → Network; filter `review` (and optionally `csrf`).  
5. Locate the **Revenue** card under Extracted figures (filter **Needs financial review** or **Scale issues**).  
6. Action = **Confirm**; correction field empty; optional reason `R4J-A one-figure diagnostic`.  
7. Click **Submit review** once.  
8. **Expected server response:** `POST /api/v1/organizations/…/documents/cc04b221-…/review` → **201** body containing `lineItem.reviewStatus = "CONFIRMED"` (and cleared scale-review flag). Preceded by `GET /api/v1/auth/csrf` → 200 if no CSRF token cached.  
9. UI expectation: green **Saved** / “Review submitted — original raw evidence preserved”; Revenue badge → **CONFIRMED**.  
10. Hard refresh the page; Revenue must remain **CONFIRMED**; summary Confirmed ≥ 1.  
11. **STOP.** Do not confirm other figures, run readiness/diagnostics, open billing, or unlock reports.

### Read-only verification (agent, after owner reports success or failure)

```sql
-- line state
SELECT id, concept, review_status, unit_scale_requires_review, scale_confidence, normalized_value::text
FROM financial_line_items WHERE id = 'f6da2815-5e54-461c-ae35-0fed50d020d1';

-- review row
SELECT id, action, actor_user_id, created_at
FROM extraction_reviews
WHERE line_item_id = 'f6da2815-5e54-461c-ae35-0fed50d020d1'
ORDER BY created_at DESC;

-- access + audit
SELECT action, actor_user_id, created_at FROM document_access_events
WHERE document_id = 'cc04b221-06c6-41da-b016-213753ca2a08' AND action = 'REVIEW';

SELECT action, actor_user_id, entity_id, created_at FROM audit_events
WHERE organization_id = '6693e901-9051-49bc-82a6-20094835432c'
  AND action = 'document.reviewed'
  AND entity_id = 'f6da2815-5e54-461c-ae35-0fed50d020d1';
```

**Pass criteria:** one `extraction_reviews` row with `action=CONFIRM` by OWNER `6e379a84-…`; line `CONFIRMED`; `unit_scale_requires_review=false`; matching REVIEW access + `document.reviewed` audit; other 17 mapped lines still PENDING; emergencies still on; payments/diagnostics still 0.

### Stop on failure

| Observation | Action |
|-------------|--------|
| No Network `POST …/review` | Stop — capture screenshot of Revenue card; do not retry beyond one intentional submit |
| POST 401/403/CSRF | Stop — save response JSON (no secrets); report |
| POST 400 | Stop — save message (e.g. accidental correction text) |
| POST 201 but refresh still PENDING | Stop — treat as true persistence defect; do not force DB confirm |
| Wrong line confirmed | Stop — report; do not chain more confirms |

---

## Required owner approval

| Next action | Gate |
|-------------|------|
| One-figure production Confirm diagnostic | `AUTHORIZE A12-A2-U-R4J-A ONE-FIGURE CONFIRM DIAGNOSTIC` |
| Full 18-figure owner confirmation retry | Separate authorize (e.g. prior R4I phrase or a dedicated R4J full-confirm authorize) |
| Optional UX hardening deploy | Separate authorize + normal release process |

---

## STOP FOR OWNER REVIEW

**FAIL** on confirmation persistence outcome (**0/18** still).  
**Root cause:** production received **no** review POSTs during the owner session; the Confirm UI requires **Submit review**, and the persistence pipeline itself is intact under local tests.  
**No production financial records were mutated during this investigation.**
