# M8 SECURITY AND RELIABILITY — ACCEPTANCE

**Date:** 2026-11-17  
**Verdict: PASS** (defensive local audit + IT) / residual infrastructure OPEN  

## Controls verified (code + IT)

| Area | Status |
|------|--------|
| Auth / session / CSRF | Strong — `security.integration.test.ts` PASS |
| Org isolation / RBAC | Strong — documents/diagnostics/reports/billing IT |
| Payment webhook HMAC + re-verify | Strong — billing IT |
| Idempotent fulfillment / concurrent verify | Strong |
| Upload validation / malware / emergency uploads | Strong (documents IT; not re-run exhaustively this pass) |
| Report storage key tenant prefix | Strong |
| `xray.report_generate` API gate + audit | **Added** (D-P0-005) |
| Worker report path | Integrity-only; must not generate PDFs |

## Shared physical bucket (D-P2-001) — remediation plan (no remap)

1. Inventory prefixes for quarantine / documents / reports  
2. Provision separate credentials for quarantine + reports buckets  
3. Owner-authorized cutover of `S3_QUARANTINE_BUCKET` / `S3_REPORTS_BUCKET` with dual-read if needed  
4. Verify upload→scan→promote and report PDF write; deny wrong-prefix keys  
5. Rollback = revert env to shared documents bucket  

**Do not remap production in this program.** Status remains ACCEPTED_RISK until owner authorize.

## Residual OPEN

- Soft BullMQ failed-job retention (not a dedicated DLQ consumer)  
- Thin monitoring / unused `os.monitoring`  
- Retention purge not implemented (D-P1-011)  
- Live Korapay (D-P1-003)  
