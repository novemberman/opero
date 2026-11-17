# Defect Register

**Updated:** 2026-11-17 (post [Thoroughness: medium](8e217dbd-4e70-4645-b483-e05f9a4e0b5e) + [Thoroughness: very thorough](52209ec9-1577-437e-a95d-0bf25cfef322) audits)  
**Status key:** OPEN / FIXED_LOCAL / BLOCKED_EXTERNAL / ACCEPTED_RISK

| ID | Sev | Title | Status | Evidence / notes |
|----|-----|-------|--------|------------------|
| D-P0-001 | P0 | Pilot Confirm clicks did not persist (0/18) | FIXED_LOCAL | Root cause: prod UX never POSTed. One-click **Confirm figure** + `submitExtractionReview`. Needs **web deploy** + owner re-confirm. One-figure diagnostic still FAIL on prod. |
| D-P0-002 | P0 | False success on review without server ack | FIXED_LOCAL | Requires `lineItem` in response; shared submit helper. |
| D-P1-012 | P1 | Playwright E2E cannot run on current Hetzner host | BLOCKED_EXTERNAL | Missing Chromium shared libs (`libnspr4`…); no sudo. Specs in `apps/web/e2e/`; happy-dom + contract E2E PASS. |
| D-P0-003 | P0 | Worker may set document `READY` while lines still PENDING | OPEN | Mitigated by eligibility/readiness + post-review reconcile; worker initial status still may open READY before confirms. `document-process.processor.ts`. |
| D-P0-004 | P0 | B2.2 concepts extractable but unused in KPI formulas | OPEN | Schema Increment A/B1; not wired in `@opero/diagnostics` KPIs. |
| D-P0-005 | P0 | `xray.report_generate` entitlement never enforced | OPEN | Create/publish free; only view/PDF gated. Product decision before enforcing. |
| D-P1-001 | P1 | Document stays `REVIEW_REQUIRED` after material confirms | FIXED_LOCAL | `reconcileDocumentReviewStatus` on review **and** `status()` (M2-P4). Prod API still `bc1567a` until authorized API deploy. |
| D-P1-002 | P1 | Confirm UX ambiguous (dropdown vs Submit) | FIXED_LOCAL | One-click Confirm; Correct/Reject secondary. |
| D-P1-003 | P1 | Korapay hosted checkout / settlement unverified | BLOCKED_EXTERNAL | Gate C unresolved. |
| D-P1-004 | P1 | Production deploy SHA skew (API/web/worker) | OPEN | Web `15299f1`; API `bc1567a`; worker `31749a3`. Next authorize: API-only for M2-P4. |
| D-P1-005 | P1 | Uploads/checkout emergency shutdown still on | ACCEPTED_RISK | Intentional. |
| D-P1-006 | P1 | CSRF exempt matching used `includes`/`endsWith` | FIXED_LOCAL | Exact `/api/v1`-relative allowlist; nested only where intended. |
| D-P1-007 | P1 | Multer 25 MiB vs `DOCUMENT_MAX_BYTES` 20 MiB | FIXED_LOCAL | Multer limit aligned to 20 MiB. |
| D-P1-008 | P1 | “Continue to readiness / review” navigated away from line review | FIXED_LOCAL | Primary CTA scrolls to `#extracted-figures`. |
| D-P1-009 | P1 | Billing / reports / members UI unfinished (JSON dumps) | OPEN | Frontend audit; DS inconsistency. |
| D-P1-010 | P1 | Diagnostics can start without readiness READY | OPEN | CLEAN docs only; unconfirmed → INSUFFICIENT_DATA. |
| D-P1-011 | P1 | Upload retention purge not implemented | OPEN | Soft-delete + `retentionUntil` metadata only. |
| D-P2-001 | P2 | Shared physical S3 bucket prefixes | ACCEPTED_RISK | Owner-approved migration only. |
| D-P2-002 | P2 | Limited browser E2E automation | OPEN | |
| D-P2-003 | P2 | APP_VERSION stamp drift | OPEN | |
| D-P2-004 | P2 | OCR absent (image PDFs → MANUAL_REQUIRED) | OPEN | |
| D-P2-005 | P2 | AI grounding lexical-only for figures | OPEN | |
| D-P2-006 | P2 | Subscription auto-renew / Direct Debit unwired | OPEN | Manual renew only. |
| D-P2-007 | P2 | No App Router `error.tsx` / `not-found.tsx` | OPEN | |
| D-P2-008 | P2 | `os.seats` / `os.monitoring` entitlements unused | OPEN | |

## Classification guidance

- **P0:** Security, financial integrity, or core journey blocker  
- **P1:** Important reliability / commercial / UX journey gate  
- **P2:** Polish, maintainability, deferred product surface  
