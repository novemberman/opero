# PR2L-B — A12-A2-U-R4J-A One-Figure Diagnostic Result

**Verdict: FAIL**  
**Date:** 2026-11-17 (~05:19 UTC)  
**Authorization used:** Owner-authorized one production Revenue confirmation — **agent performed READ-ONLY verification only** (no retry mutation)

**Organization:** `6693e901-9051-49bc-82a6-20094835432c`  
**Document:** `cc04b221-06c6-41da-b016-213753ca2a08`  
**Target:** Revenue / `REVENUE`  
**Line item ID:** `f6da2815-5e54-461c-ae35-0fed50d020d1`  
**Pilot OWNER:** `6e379a84-e6cb-407b-8434-802f41a3777d` (`pilot@opero.coworkxspace.com`)

**Not performed:** confirm/correct/reject; DB writes; deploy; uploads/checkout changes; reports; payments.

---

## Verdict summary

| Criterion | Result |
|-----------|--------|
| Revenue persisted `CONFIRMED` | **NO** — still `PENDING` |
| Remaining 17 mapped figures unchanged | **YES** — all still `PENDING` (no collateral confirms) |
| Overall | **FAIL** |

**Persisted confirmation count:** **0 / 1** for this diagnostic (Revenue); **0 / 18** mapped overall.

---

## Verification checklist

| # | Check | Result |
|---|-------|--------|
| 1 | Revenue `CONFIRMED` | **FAIL** — `PENDING` |
| 2 | Normalized value unchanged | **PASS** — `1250000` |
| 3 | Currency NGN | **PASS** |
| 4 | Scale ACTUAL ×1 | **PASS** — `unit_scale=ACTUAL`; `unit_scale_requires_review=true` still |
| 5 | Review record exists | **FAIL** — `extraction_reviews` for line = **0** |
| 6 | Confirmation timestamp | **FAIL** — none; `updated_at` still equals create (`2026-11-16 19:27:41.665`) |
| 7 | Attribution to pilot OWNER | **FAIL** — no review/audit row to attribute |
| 8 | Survives refresh | **N/A** — never confirmed |
| 9 | Other 17 mapped remain PENDING | **PASS** |
| 10 | No optional/contextual confirms | **PASS** — UNMAPPED still PENDING; confirmed_unmapped=0 |
| 11 | Document status accurate, READY not forced | **PASS** — still `REVIEW_REQUIRED` / `MANUAL_REQUIRED` / `CLEAN` |
| 12 | No reports/payments/entitlements | **PASS** — payments=0, entitlements=0, checkouts=0, diagnostics=0, xray_reports=0 |
| 13 | Upload/checkout shutdowns active | **PASS** — `EMERGENCY_DISABLE_UPLOADS=true`, `EMERGENCY_DISABLE_CHECKOUT=true`, `PILOT_UPLOAD_ENABLED=false` |

---

## Failure mode

**Did not persist because no confirmation mutation reached the API.**

Evidence:

| Signal | Observed |
|--------|----------|
| Line `review_status` | `PENDING` |
| `extraction_reviews` (this line / pilot org) | **0** |
| `document_access_events` REVIEW | **0** (only historical UPLOAD) |
| `audit_events` `document.reviewed` | **0** |
| Lines with `updated_at > created_at + 1s` | **0** |
| Production API logs | **No** `POST …/documents/…/review` for this document (browser traffic remains GETs only in retained log window) |
| HTTP 4xx/5xx on review | **None observed** — request appears **never issued**, not rejected/validated-away |

This matches R4J-A investigation root cause: Confirm UI on **deployed production web** (`f59e65e…`) still requires Action=Confirm **and** Submit review; local one-click Confirm UX (`9993c39` / `da1322e`) is **not deployed**.

No automatic retry was performed.

---

## Figure integrity (Revenue)

| Field | Value |
|-------|-------|
| `normalized_value` | `1250000` |
| `raw_value` | `1,250,000` |
| `currency` | NGN |
| `unit_scale` | ACTUAL |
| `scale_confidence` | UNKNOWN |
| `unit_scale_requires_review` | true |

Fixture integrity preserved; no accidental correction.

---

## Document status

| Field | Value |
|-------|-------|
| `processing_status` | `REVIEW_REQUIRED` |
| `extraction_status` | `MANUAL_REQUIRED` |
| `scan_status` | `CLEAN` |
| Forced READY? | **No** |

---

## Remaining blockers

1. **Owner must complete browser Confirm** that actually issues `POST …/review` (on current prod UI: Action **Confirm**, empty correction, **Submit review**; or deploy local one-click Confirm UX first).  
2. **Optional:** authorize production deploy of Confirm UX commits (`da1322e` / `9993c39`) before retry for clearer UX.  
3. After a successful Network `201` on Revenue, re-run this verification.  
4. Keep emergencies on; do not open uploads/checkout.

---

## STOP FOR OWNER REVIEW

**FAIL** — Revenue is **not** CONFIRMED; persistence count **0/1**; mutation **did not reach** the API (not a validation rejection after POST).  
**No production financial records were mutated by this verification.**
