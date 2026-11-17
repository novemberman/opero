# M2-P1 ONE-FIGURE PRODUCTION ACCEPTANCE

**Date:** 2026-11-17  
**Verdict: PASS**  
**Mode:** READ-ONLY verification after owner-authorized Revenue confirmation  
**No mutations, retries, deployments, uploads, reports, or payments performed.**

| Target | ID |
|--------|-----|
| Organization | `6693e901-9051-49bc-82a6-20094835432c` |
| Document | `cc04b221-06c6-41da-b016-213753ca2a08` |
| Revenue line item | `f6da2815-5e54-461c-ae35-0fed50d020d1` |

---

## Acceptance checklist

| # | Check | Result |
|---|-------|--------|
| 1 | Revenue persisted **CONFIRMED** | **PASS** |
| 2 | Normalized amount `1250000` | **PASS** |
| 3 | Currency **NGN**, scale **ACTUAL** (×1) | **PASS** (`unit_scale=ACTUAL`, `unit_scale_requires_review=false`) |
| 4 | Extraction review record exists | **PASS** (`b3afb4e1-…`, action `CONFIRM`) |
| 5 | Attributed to pilot **OWNER** | **PASS** — `6e379a84-…` / `pilot@opero.coworkxspace.com` / role **OWNER** |
| 6 | Timestamp + audit evidence | **PASS** — review `2026-11-17 05:55:38.901Z`; audit `document.reviewed` `05:55:38.921Z` |
| 7 | Persisted server state (refresh-safe) | **PASS** — DB row remains CONFIRMED |
| 8 | Other **17** mapped monetary figures **PENDING** | **PASS** |
| 9 | Optional contextual UNMAPPED unchanged | **PASS** — still PENDING / `400000` / Property plant and equipment |
| 10 | Document / readiness statuses recorded | **PASS** (see below) |
| 11 | No new reports / payments / entitlements / grants | **PASS** (all **0**) |
| 12 | `EMERGENCY_DISABLE_UPLOADS=true` | **PASS** |
| 13 | `EMERGENCY_DISABLE_CHECKOUT=true` | **PASS** |
| 14 | `pilotUpload.windowOpen=false` | **PASS** (`PILOT_UPLOAD_ENABLED=false`, emergency uploads on, expiry in the past) |
| 15 | Production API / worker / web healthy | **PASS** |

---

## Persisted confirmation evidence

### Revenue line item

| Field | Value |
|-------|--------|
| `review_status` | **CONFIRMED** |
| `normalized_value` | **1250000** |
| `currency` | **NGN** |
| `unit_scale` | **ACTUAL** |
| `unit_scale_requires_review` | **false** |
| `updated_at` | `2026-11-17 05:55:38.911` |

### Counts

| Metric | Value |
|--------|-------|
| Confirmed mapped monetary | **1** (Revenue only) |
| Pending mapped monetary | **17** |
| Total mapped monetary | **18** |
| `extraction_reviews` (org) | **1** |

### Extraction review

| Field | Value |
|-------|--------|
| Review id | `b3afb4e1-35f8-4444-9640-ef640706cf5a` |
| `line_item_id` | `f6da2815-…` (Revenue) |
| `actor_user_id` | `6e379a84-e6cb-407b-8434-802f41a3777d` |
| Actor | `pilot@opero.coworkxspace.com` · Mark Dee · **OWNER** |
| `action` | **CONFIRM** |
| `previous_value` / `new_value` | `1250000` / `1250000` (value preserved) |
| `previous_concept` / `new_concept` | `REVENUE` / `REVENUE` |
| `created_at` | `2026-11-17 05:55:38.901` |

### Audit

| Field | Value |
|-------|--------|
| Audit id | `a4aa83a0-beba-4a54-af1c-07c1c3a35c1a` |
| `action` | `document.reviewed` |
| `entity_type` / `entity_id` | `financial_line_item` / Revenue id |
| `actor_user_id` | same OWNER |
| `metadata` | `{"action":"CONFIRM"}` |
| `created_at` | `2026-11-17 05:55:38.921` |

A review **POST succeeded** (201 path): line item + `extraction_reviews` + `document.reviewed` audit are all present. No backend rejection.

---

## Remaining pending figures (17)

All other mapped monetary concepts remain **PENDING** with prior values (ACTUAL / NGN):

COST_OF_GOODS_SOLD, GROSS_PROFIT, OPERATING_EXPENSES, OPERATING_PROFIT, NET_PROFIT, CASH_AND_EQUIVALENTS, ACCOUNTS_RECEIVABLE, ACCOUNTS_PAYABLE, TOTAL_ASSETS, TOTAL_LIABILITIES, EQUITY, INVENTORY, INTEREST_BEARING_DEBT, INTEREST_EXPENSE, PROFIT_BEFORE_TAX, INCOME_TAX_EXPENSE, TOTAL_LIABILITIES_AND_EQUITY.

Contextual UNMAPPED “Property plant and equipment” remains PENDING / 400000 (unchanged).

---

## Document / readiness status

| Field | Actual |
|-------|--------|
| `processing_status` | **REVIEW_REQUIRED** |
| `extraction_status` | **MANUAL_REQUIRED** |
| `scan_status` | **CLEAN** |

Expected while 17 material confirms remain. Production API is still `bc1567a` (no READY reconcile deploy); badge will not flip to READY until remaining material figures are confirmed **and** (if desired) the optional API reconcile ships.

---

## Safety controls & side effects

| Control | Value |
|---------|--------|
| `EMERGENCY_DISABLE_UPLOADS` | **true** |
| `EMERGENCY_DISABLE_CHECKOUT` | **true** |
| `PILOT_UPLOAD_ENABLED` | **false** |
| `PILOT_UPLOAD_EXPIRES_AT` | `2026-11-16T19:39:44.000Z` (past) |
| `LIVE_PILOT_ENABLED` | unset → false |
| `PUBLIC_REGISTRATION_ENABLED` | **false** |
| `pilotUpload.windowOpen` | **false** |
| `xray_reports` / `payments` / `entitlement_grants` / `checkout_intents` | **0 / 0 / 0 / 0** |

---

## Service health (production)

| Service | Health | Active SUCCESS commit |
|---------|--------|------------------------|
| API | `/api/v1/health` + `/ready` **200** | `bc1567a70c54…` (`284557e2-…`) |
| Worker | deployment **SUCCESS** online | `31749a375ae5…` (`be67a5e4-…`) |
| Web | `/health` **200** | `e7e41b7c4aca…` (`cdc0949a-…`) Confirm UX tip |

---

## Recommendation — remaining 17 confirmations

1. Continue as the same pilot **OWNER** on the same document using **Confirm figure** one concept at a time (or batched only if a separately authorized procedure says so).
2. After each confirm (or at the end), re-run a read-only count gate: expect `confirmed_mapped` to rise and `pending_mapped` to fall; siblings must not flip without an explicit review row.
3. Keep emergencies / upload window closed; do not enable checkout, registration, or payments.
4. When all 18 mapped monetary figures are CONFIRMED, re-check document `processing_status`. If it remains `REVIEW_REQUIRED` solely due to missing API reconcile, authorize an optional API-only deploy of the reconcile commit — not required for per-figure persistence.
5. Do **not** generate reports or open Korapay until a separate owner authorize phrase is issued.

---

## Verdict

**PASS** — Revenue ₦1,250,000 NGN ACTUAL ×1 is persisted CONFIRMED with OWNER audit; 17 mapped monetary figures remain PENDING; no commercial side effects; shutdowns intact.

**STOP FOR OWNER REVIEW.**
