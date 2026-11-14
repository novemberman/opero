# Phase 8 — Financial Extraction Intelligence & Live Processing

**Baseline:** `84021eb` (staging CSRF / same-origin proxy).  
**Status:** Implemented locally — awaiting owner review. **Do not deploy until approved.**

## Architecture audit (Part A)

### Existing processing state machine (IMPLEMENTED)

`DocumentProcessingStatus`: `UPLOADED → QUARANTINED → SCANNING → SCANNED → EXTRACTING → EXTRACTED | REVIEW_REQUIRED | READY | REJECTED | FAILED`

Worker (`DocumentProcessProcessor`): quarantine → ClamAV fail-closed → promote storage → extract → persist statements/lines/evidence → `READY` or `REVIEW_REQUIRED`.

Job idempotency: terminal statuses are no-ops on BullMQ retry/restart.

### Already present vs Phase 8 gaps

| Capability | Status | Notes |
| --- | --- | --- |
| Unit scale ACTUAL/THOUSANDS/MILLIONS | PARTIAL | English `$` patterns only; weak NGN/₦; ambiguous → ACTUAL + warning |
| Currency detection | PARTIAL | USD/EUR/GBP; **NGN/₦ missing** |
| Concept mapping | PARTIAL | Core taxonomy exists; **gross margin → GROSS_PROFIT bug**; limited aliases |
| Quantity classification | MISSING | Percentages/ratios/dates treated as money |
| Duplicate detection | PARTIAL | Warning only; no typed corroboration vs conflict |
| Accounting consistency | PARTIAL | Soft quality flags; no first-class A=L+E / CF checks |
| Statement metadata | PARTIAL | Currency/period/scale; entity/consolidation weak |
| Line review + audit | IMPLEMENTED | CONFIRM/CORRECT/REJECT; rawValue preserved |
| Live progress UX | PARTIAL | 3s poll of coarse status; no staged timeline / upload bytes |
| Diagnostics scale apply | IMPLEMENTED | `scaleFactor` in snapshot |
| Netshift FY2025 fixture | MISSING | Synthetic CSV added in Phase 8 |

### Design choice

Extend `@opero/document-processing` + persist new line/job fields. Map user-facing stages onto existing statuses/jobs (not new queues). Polling (authenticated, backoff) for live UI — simpler and reliable with current stack; SSE deferred.

## Staging acceptance checklist

1. Apply migration `20261114180000_phase8_extraction_intelligence` to staging DB (no reset).
2. Deploy api → worker → web (after owner approval).
3. Upload a CSV with `Amounts in ₦'000` and key Netshift-like lines.
4. Confirm progress timeline advances through scan → extract → awaiting review / ready.
5. Confirm Gross margin % is not mapped as GROSS_PROFIT.
6. Confirm Revenue raw `180,000` with thousands scale normalizes to `180000000` after confirmation.
7. Confirm refresh mid-processing reconnects via status polling.
8. Confirm malware / scanner-unavailable still fail-closed.
9. Confirm diagnostics withhold absolute values for unconfirmed scale.
10. Sign out still works (Phase CSRF proxy intact).
