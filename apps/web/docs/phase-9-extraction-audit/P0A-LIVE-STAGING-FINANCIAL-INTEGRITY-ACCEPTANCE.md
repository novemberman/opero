# P0-A live staging financial integrity acceptance

**Date:** 2026-11-15  
**Environment:** Railway staging only  
**Verdict:** **PASS** (automated API/integrity path). Frontend interactive UI is **owner-walkthrough** (browser automation unavailable).

## Preflight — source-compatible deployments

| Service | Deployment ID | Status | Source commit | Image digest |
|---------|---------------|--------|---------------|--------------|
| API | `c64e90c0-26b2-484b-919d-c82fb50decca` | SUCCESS | `d301cb383b5fc9f0ca157885fef390faf8f0122b` | `sha256:d5f308bc89f24d330bc974ba5db2b8a224117eb2f2a4dfbf51e8c900ff46dad1` |
| Worker | `a0d84580-eb31-4d64-a47e-1265881f13e1` | SUCCESS | `d301cb383b5fc9f0ca157885fef390faf8f0122b` | `sha256:a84d494532366acd6b6f6eed15521e04de7a4d0671178df5760c0cce392c9b39` |
| Web | `21335127-f48f-45e1-9369-e5267c5b0c98` | SUCCESS | `d301cb383b5fc9f0ca157885fef390faf8f0122b` | `sha256:365f117859240f9a64f4626d7d7ff6c9d17e1b9df801ae6eb5050330628ddc55` |

Health: API `/api/v1/health` + `/api/v1/ready` **200**; web `/health` **200**.

## Synthetic identifiers

| Record | ID |
|--------|----|
| Org | `46ff3a84-010f-4acd-802f-188afb60950f` |
| Owner user | `21e09926-e895-4a4c-aea9-10bec6a50b32` |
| Viewer user | `d4a213be-bd61-4072-8df4-0f4271adf4f2` |
| FY2024 doc | `993ef457-d118-492d-9da2-f52daab44096` (`opero-e2e-fy2024.pdf`) |
| FY2025 doc | `1a419a2c-b8ba-4b3b-8bcd-ebfde6aab801` (`opero-e2e-fy2025.pdf`) |
| Pending diagnostic | `8eda13c2-fe5b-440f-8290-36e1f52eba31` |
| Confirmed diagnostic | `50ccd31f-6cbb-4f2f-90ce-76005aeb01f3` |
| Historical integrity run (fixture) | `b5bbecc7-688f-4aa8-a0fd-56774dd19502` |
| Historical integrity report (fixture) | `d333df65-3654-4d1e-9c63-35cf631faa02` |

Netshift FY2024 `206bda53-66ea-4656-8f40-947909525a30` was **not** reprocessed.

## Results matrix

### 1. Preflight / isolation

| Test | Result | Evidence |
|------|--------|----------|
| All three services on `d301cb3` | **PASS** | Digests above |
| Netshift fingerprint before | **PASS** | `b5e52685bfe5b557fb88cc97fec8cbb0` (58 lines) |
| Netshift fingerprint after | **PASS** | unchanged |
| Cross-tenant Netshift org/doc denied | **PASS** | HTTP 404 |
| No migrations executed by this run | **PASS** | Latest remains `20261115110000_b22_increment_b1…` |
| Worker unexpected errors | **PASS** | none in deployment logs |
| Health still 200 | **PASS** | API + web |

### 2. Pending financial inputs

| Test | Result | Evidence |
|------|--------|----------|
| Synthetic uploads + extract | **PASS** | both docs READY / CLEAN / SUCCEEDED; 29 mapped monetary lines each |
| Material monetary left PENDING | **PASS** | 58 pending mapped monetary |
| Readiness BLOCKED | **PASS** | assess → `BLOCKED` |
| Diagnostic while pending | **PASS** | run `8eda13c2…` SUCCEEDED |
| PENDING amounts excluded from authoritative inputs | **PASS** | snapshot `integrity.authoritative=true`, `contaminatedLineCount=0`; **0** COMPUTED metrics (all `INSUFFICIENT_INPUTS`) |
| BHS INSUFFICIENT_DATA | **PASS** | `overallScore=null`, status `INSUFFICIENT_DATA` |
| No provisional presented as verified | **PASS** | score withheld; integrity OK (no contaminated stored amounts) |

### 3. Explicit confirmation

| Test | Result | Evidence |
|------|--------|----------|
| VIEWER cannot review | **PASS** | HTTP 403 Insufficient permissions |
| CONFIRM + filled correction | **PASS** | HTTP 400 — requires Correct & confirm |
| Confirm eligible figures | **PASS** | 44 mapped monetary confirmed |
| Correct & confirm | **PASS** | REVENUE CORRECT→CONFIRMED (`7e1d6c28…`); GROSS_PROFIT normalized `84000` CONFIRMED |
| Reviewer attribution / audit | **PASS** | `extraction_reviews` + `audit_events.document.reviewed` actor = owner |
| Readiness after confirm | **PASS** | `READY` |
| New diagnostic | **PASS** | `50ccd31f…` SUCCEEDED |
| Deterministic KPIs | **PASS** | FY2025 GROSS_MARGIN `0.59375` (=95k/160k); REVENUE_GROWTH `0.111…` (=(160−144)/144); inputRefs CONFIRMED-only |
| BHS from eligible inputs | **PASS** | status `SCORED`, overall **76**, integrity authoritative |

### 4. Historical-output protection (synthetic fixtures only)

Isolated contaminated snapshot inserted in the **test org only** (PENDING + CORRECTED amounts frozen with `actualValue`). Customer/Netshift rows untouched.

| Test | Result | Evidence |
|------|--------|----------|
| Contaminated snapshot detected | **PASS** | `UNCONFIRMED_AMOUNTS_IN_SNAPSHOT`, contaminatedLineCount=2, authoritative=false |
| Score route flags integrity | **PASS** | same integrity on `/score` |
| Report presentation non-verified | **PASS** | stored `verifiedPublication=true` → preview forced `false` + non-verified disclosures; integrity returned |
| Version route cannot bypass | **PASS** | integrity false; `verifiedPublication=false` |
| PDF route no bypass | **PASS** | HTTP 409 (no published PDF artifact) |
| AI cannot claim verified publication | **PASS** | historical AI FAILED/no verified-publication claim; diagnostic integrity remains non-authoritative |
| Historical rows unchanged | **PASS** | snapshot payload identical after reads |

### 5. Frontend acceptance

| Check | Automated | Manual (owner) |
|-------|-----------|----------------|
| “Correct & confirm” action label | **PASS** (live web chunk evidence from deploy) | Confirm on a live document |
| “Needs re-confirm” for CORRECTED | **PASS** (bundle) | Confirm badge on legacy CORRECTED if present |
| Pending monetary warnings | **PASS** (API readiness BLOCKED + board copy in bundle) | Observe warning banner |
| Blocked readiness UI | API **PASS** | Open readiness while pending |
| Confirmed diagnostic results | API **PASS** (score 76) | Open diagnostics UI |
| Historical non-verified disclosures | API **PASS** | Open fixture report if retained |

**Limitation:** browser automation unavailable in this session. Owner walkthrough checklist below.

## Before / after diagnostic

| | Pending run `8eda13c2…` | Confirmed run `50ccd31f…` |
|--|-------------------------|---------------------------|
| Snapshot integrity | authoritative OK (0 contaminated) | authoritative OK |
| COMPUTED metrics | 0 | 23 |
| BHS | `INSUFFICIENT_DATA` / null | `SCORED` / **76** |
| GROSS_MARGIN | unavailable | FY2025 `0.59375` |
| REVENUE_GROWTH | unavailable | `0.111…` |

## Owner walkthrough checklist (manual)

1. Sign in as the synthetic owner (or a staging analyst) on `https://opero-web-staging.up.railway.app`.
2. Open org `46ff3a84…` → document FY2024 → confirm Action dropdown shows **Correct & confirm**.
3. On a CORRECTED legacy line (if any), badge shows **Needs re-confirm**.
4. Enter a correction with Action=Confirm → client error requiring Correct & confirm.
5. With pending material reviews, readiness shows blocked / action required.
6. After confirmations, readiness clears; diagnostics show scored BHS and confirmed KPIs.
7. Open historical fixture report `d333df65…` → non-verified disclosures; not shown as verified publication.

## Remaining defects / notes

| Item | Severity | Notes |
|------|----------|-------|
| No interactive browser E2E | Low (process) | Manual checklist required |
| Email verify bootstrap | Info | Synthetic users only; DB `email_verified_at` |
| Historical fixture entitlement | Info | Manual REPORT-scoped `xray.full_report` grant used solely to observe FULL preview demotion |
| Payment-entitlement remediation | Out of scope | Not started |

## Restrictions honored

- No application code changes, pushes, or further deploys  
- No Netshift reprocess / no production  
- No payment-entitlement remediation beyond synthetic fixture entitlements for read demotion proof  
- No schema/migrations  

**Stopped for owner review.**
