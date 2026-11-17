# Defect Register

**Updated:** 2026-11-17  
**Status key:** OPEN / FIXED_LOCAL / BLOCKED_EXTERNAL / ACCEPTED_RISK

| ID | Sev | Title | Status | Evidence / notes |
|----|-----|-------|--------|------------------|
| D-P0-001 | P0 | Pilot Confirm clicks did not persist (0/18) | FIXED_LOCAL | R4J-A: no `POST /review` issued. Fix: one-click **Confirm figure** + error handling. Needs deploy + owner re-confirm. |
| D-P0-002 | P0 | False success on review without server ack | FIXED_LOCAL | Client now requires `lineItem` in response; try/catch surfaces failures. |
| D-P1-001 | P1 | Document stays `REVIEW_REQUIRED` after all material confirms | FIXED_LOCAL | `reconcileDocumentReviewStatus` promotes to READY when material pending = 0. |
| D-P1-002 | P1 | Confirm UX ambiguous (Action dropdown vs Submit) | FIXED_LOCAL | Primary one-click Confirm; Correct/Reject secondary. |
| D-P1-003 | P1 | Korapay hosted checkout / settlement unverified | BLOCKED_EXTERNAL | Sandbox Gate C unresolved; no live payments. |
| D-P1-004 | P1 | Production deploy SHA skew (API/web/worker) | OPEN | API `bc1567a`, web `f59e65e`, worker `31749a3`; `/ready.version` stamp stale. |
| D-P1-005 | P1 | Uploads/checkout emergency shutdown still on | ACCEPTED_RISK | Intentional pilot safety; owner authorize to open. |
| D-P2-001 | P2 | Shared physical S3 bucket for docs/quarantine/reports | ACCEPTED_RISK | Prefix isolation; migration plan only with owner approve. |
| D-P2-002 | P2 | Limited browser E2E automation | OPEN | Strong API/package tests; Playwright journey not fully wired. |
| D-P2-003 | P2 | APP_VERSION env not always matching deploy commit | OPEN | Ops hygiene. |

## Classification guidance used

- **P0:** Security, financial integrity, or core journey blocker  
- **P1:** Important reliability / commercial gate  
- **P2:** UX, maintainability, ops polish  
