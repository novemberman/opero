# P0-B Live Staging Commercial Acceptance

**Date:** 2026-11-15  
**Environment:** Railway staging only  
**Verdict:** **PASS** (automated API commercial path). Frontend interactive click-through is **owner walkthrough** (browser automation unavailable).

## Verified deployments

| Service | Deployment ID | Status | Source | Image digest |
|---------|---------------|--------|--------|--------------|
| API | `ee229de6-e94d-4141-8a45-2ecad1f3fea2` | SUCCESS | `cc7041f` | `sha256:3bca62c78ff544e10495c4a78979fb956e1c0315d99560749d59249a68948f58` |
| Web | `1b79c5d5-617d-492b-854c-ea5ee14ac65e` | SUCCESS | `cc7041f` | `sha256:8ce02600f73c05c89076345284b2837f5acaff283e6eb9c07ae461dd6b6ff30a` |
| Worker | `a0d84580-eb31-4d64-a47e-1265881f13e1` | SUCCESS | `d301cb3` | `sha256:a84d494532366acd6b6f6eed15521e04de7a4d0671178df5760c0cce392c9b39` |

## Environment configuration verification

| Check | Result |
|-------|--------|
| `APP_ENV=staging` | **PASS** |
| `PAYMENT_PROVIDER=mock` | **PASS** |
| `APP_ORIGIN=https://opero-web-staging.up.railway.app` | **PASS** |
| API `/health` + `/ready` | **PASS** (DB/Redis/storage ok) |
| Web `/health` | **PASS** |
| Worker unchanged @ `d301cb3` | **PASS** |
| Netshift FY2024 fingerprint | **PASS** before/after `b5e52685bfe5b557fb88cc97fec8cbb0` (58 lines) |

## Synthetic identifiers

| Record | ID |
|--------|----|
| Org | `f14b10e2-4219-45bb-b3b8-65d757929bf5` |
| Owner | `92e17c7d-b357-4121-ba29-5e750aa68d34` |
| Viewer | `2c913028-30b0-4e57-9b0a-7b621329b37a` |
| Outsider | `416420ab-40c8-4845-843f-938376332d75` |
| Outsider org | `9448608f-3bc5-44ff-8512-eba1a1ac13b3` |
| FY2024 doc | `37f08f58-5944-487a-940d-3e4cc470d301` |
| FY2025 doc | `7143c296-b7fb-4978-a048-bd3f09efc9c2` |
| Diagnostic run | `e6da984f-8ca5-45db-9f49-4b9f82397d91` |
| Report | `89fcf1ae-a701-4a79-bfa8-327a778ca45b` |
| Version | `4744aded-0542-4457-9bae-aa079ba683f4` |
| Storage key | `org/f14b10e2-…/reports/89fcf1ae-…/4744aded-….pdf` |
| Payment | `87079002-c47c-4999-9db1-2dd711643d1c` |
| Reference | `opero_763b6cd1170c4996b9fffc643f09f7c3` |
| Purchase | `f8926779-1859-4f1d-b69d-5ac9acdc57f5` |
| Locked sibling report | `60014cca-98a8-47af-bec3-7519bb5c8b62` |
| Historical integrity fixture report | `d8f9b230-a86c-43ec-b50e-d0cfaa374b4b` |

## Results matrix

### Preflight / synthetic report

| Check | Result |
|-------|--------|
| Isolated synthetic org | **PASS** |
| Confirmed financial inputs (58) | **PASS** |
| Readiness READY | **PASS** |
| Diagnostics authoritative + BHS 76 | **PASS** |
| Report publish + private PDF object | **PASS** (`byteSize` 5709, contentHash present) |
| No entitlement before payment | **PASS** (0 grants) |
| AI interpretation | **BLOCKED** (not required; publish succeeded without AI) |

### Unpaid → checkout → settle → paid

| Check | Result | Evidence |
|-------|--------|----------|
| Unpaid PDF | **PASS** | HTTP **403** `ENTITLEMENT_REQUIRED`; no storage URL disclosed |
| Checkout | **PASS** | org/report/product `XRAY_PRO`; **1,500,000** NGN; PENDING; mock-pay URL |
| Unauthorized settle (viewer) | **PASS** | HTTP **403** |
| Mock settle success | **PASS** | provider `success` → fulfill `FULFILLED` → payment `SUCCEEDED` |
| Entitlements | **PASS** | REPORT-scoped `xray.full_report` + `xray.pdf_download` |
| Audits | **PASS** | `billing.mock_settled` / `payment_verified` / `payment_fulfilled`; no secrets |
| Paid PDF | **PASS** | HTTP **200** `application/pdf`; magic `%PDF-`; 5709 bytes; `private, no-store` |
| Financial reconciliation | **PASS** | access `FULL`; integrity authoritative; overallScore **76**; PDF contains `76` |

### Negative controls

| Check | Result |
|-------|--------|
| Duplicate settle idempotent | **PASS** (`ALREADY_FULFILLED`; still 2 grants) |
| Failed payment no unlock | **PASS** |
| Cancelled/abandoned no unlock | **PASS** |
| Pending no unlock | **PASS** |
| Wrong amount (`AMOUNT_MISMATCH`) | **PASS** |
| Wrong currency (`CURRENCY_MISMATCH`) | **PASS** |
| Other report remains locked | **PASS** (403 `ENTITLEMENT_REQUIRED`) |
| Cross-tenant PDF / settle | **PASS** (404) |
| Netshift org denied | **PASS** (404) |
| Unauthenticated PDF | **PASS** (401) |
| Direct R2 bypass | **PASS** (no public URL; API-mediated only) |
| Production mock isolation | **PASS** (staging mock + boot forbid in production) |
| Historical non-verified integrity | **PASS** (`authoritative=false`, `UNCONFIRMED_AMOUNTS_IN_SNAPSHOT`, contaminatedLineCount=2) |
| Netshift untouched after | **PASS** |

### Frontend

| Check | Automated | Manual |
|-------|-----------|--------|
| `/billing/mock-pay` deployed | **PASS** (HTTP 200) | Complete test payment click |
| `/reports/.../unlock` deployed | **PASS** (HTTP 200) | Full checkout journey |
| Payment state messaging | API **PASS** | Confirm UI never unlocks before API success |

**Limitation:** no browser automation in this session.

## Before / after download

| Moment | HTTP | Code / type |
|--------|------|-------------|
| Before payment | **403** | `ENTITLEMENT_REQUIRED` |
| After successful settle | **200** | `application/pdf` (`%PDF-`, 5709 bytes) |

## Defects (ranked)

| Severity | Item | Notes |
|----------|------|-------|
| Low / harness | Incomplete historical fixture initially omitted `quality`, causing report assemble **500** | Repaired fixture payload in synthetic org only; product path for real reports unaffected. Consider hardening assemble against missing quality in a later increment (not P0-B). |
| N/A | AI interpretation | **BLOCKED** optional path; commercial publish/download succeeded without it. |

No P0-B commercial launch blockers found on staging.

## Summary counts

**50 PASS · 1 BLOCKED · 0 FAIL**

## Stop

No application code changes, pushes, or additional deploys. Production untouched. Increment C not started. Awaiting owner review.
