# Defect Register

**Updated:** 2026-11-17 (M13-B3 redirect production release PASS)  
**Status key:** OPEN / FIXED_LOCAL / PARTIAL_LOCAL / BLOCKED_EXTERNAL / ACCEPTED_RISK / DEFERRED

| ID | Sev | Title | Status | Evidence / notes |
|----|-----|-------|--------|------------------|
| D-P1-015 | P1 | Korapay post-payment redirect 404 (`/billing/return`) | FIXED_LOCAL | Fixed in `e3c676b`; **production API+web deployed** M13-B3 (`0c56128f-…` / `2c5ba76c-…`). `/billing/return` 200; return-context 401/404 scoped. See `M13-B3-KORAPAY-REDIRECT-PRODUCTION-RELEASE.md`. |
| D-P1-003 | P1 | Korapay hosted checkout / settlement unverified | PARTIAL_LOCAL | **Sandbox Gate C PASS** on `opero_29ef2711…`. **Live** settlement still unverified. Redirect UX fixed under D-P1-015. See M13-B / M13-B2. |
| D-P1-014 | P1 | No production-safe synthetic entitlement grant/revoke API (M12-F BLOCKED) | FIXED_LOCAL | M12-G ops dual-token `/ops/synthetic-entitlements` (+ revoke); separate MANUAL grants for `xray.report_generate` and `xray.pdf_download`; flag off by default; revoke-during-shutdown; IT PASS. Prod API deployed M12-H1; issuance OFF after M12-H2. |
| D-P1-013 | P1 | M12-A expected BHS 46 ignored production `quality=LOW` reliability gate | ACCEPTED_RISK / DOCUMENTED | Prod run `ad64efd5-…` correctly **INSUFFICIENT_DATA** (reliability 0.4 < 0.50). Confirmation ≠ rewrite of extraction quality. score.v1 unchanged; regression tests added. See M12-C. |
| D-P0-001 | P0 | Pilot Confirm clicks did not persist (0/18) | FIXED_LOCAL | Root cause: prod UX never POSTed. One-click **Confirm figure** + `submitExtractionReview`. Needs **web deploy** + owner re-confirm. One-figure diagnostic still FAIL on prod. |
| D-P0-002 | P0 | False success on review without server ack | FIXED_LOCAL | Requires `lineItem` in response; shared submit helper. |
| D-P1-012 | P1 | Playwright E2E cannot run on bare Hetzner host | FIXED_LOCAL | Mitigated: Docker `mcr.microsoft.com/playwright:v1.56.1-jammy` + host network; no Hetzner package changes. M4/M5 + review specs **5/5 PASS**. |
| D-P2-009 | P2 | Live OpenAI interpretation unverified in this program | BLOCKED_EXTERNAL | Provider-neutral architecture + mock/fake IT PASS; production keys/cost not exercised. |
| D-P0-003 | P0 | Worker may set document `READY` while lines still PENDING | FIXED_LOCAL | Worker uses `materialMonetaryNeedsConfirmation`; diagnostics `createRun` belt refuses sticky READY with material PENDING. Documents IT PASS. Needs coordinated API+worker deploy. |
| D-P0-004 | P0 | B2.2 concepts extractable but unused in KPI formulas | FIXED_LOCAL / DEFERRED | Advisory CF/equity identities in quality details when complete; do not gate `score.v1`. Standalone KPIs for investing/financing/net cash/share capital/RE/tax payable deferred. |
| D-P0-005 | P0 | `xray.report_generate` entitlement never enforced | FIXED_LOCAL | Publish requires `xray.report_generate` after integrity gates; granted via `XRAY_PRO_ENTITLEMENTS` + OS plan migration. Draft/review remain free. Needs API deploy + migration. |
| D-P1-001 | P1 | Document stays `REVIEW_REQUIRED` after material confirms | FIXED | `reconcileDocumentReviewStatus` on review **and** `status()` (M2-P4/P5). Prod API `77ecbf6…` (`baa04a73-…`); pilot doc reconciled READY on OWNER status read. |
| D-P1-002 | P1 | Confirm UX ambiguous (dropdown vs Submit) | FIXED_LOCAL | One-click Confirm; Correct/Reject secondary. |
| D-P1-004 | P1 | Production deploy SHA skew (API/web/worker) | OPEN | Web `15299f1`; API `77ecbf6` (M2-P5); worker `31749a3`. Cleared only by coordinated RC deploy. |
| D-P1-005 | P1 | Uploads/checkout emergency shutdown still on | ACCEPTED_RISK | Intentional. |
| D-P1-006 | P1 | CSRF exempt matching used `includes`/`endsWith` | FIXED_LOCAL | Exact `/api/v1`-relative allowlist; nested only where intended. |
| D-P1-007 | P1 | Multer 25 MiB vs `DOCUMENT_MAX_BYTES` 20 MiB | FIXED_LOCAL | Multer limit aligned to 20 MiB. |
| D-P1-008 | P1 | “Continue to readiness / review” navigated away from line review | FIXED_LOCAL | Primary CTA scrolls to `#extracted-figures`. |
| D-P1-009 | P1 | Billing / reports / members UI unfinished (JSON dumps) | FIXED_LOCAL | Billing + members structured UI (M7). Reports list polish still uneven. |
| D-P1-010 | P1 | Diagnostics can start without readiness READY | FIXED_LOCAL | API requires `processingStatus=READY`; web lists READY-only. Soft INSUFFICIENT_DATA remains for incomplete confirmed sets. |
| D-P1-011 | P1 | Upload retention purge not implemented | PARTIAL_LOCAL | Soft-delete + `RetentionPurgeService.dryRun` (DELETED past `retentionUntil`, tenant filter). Hard purge / legal-hold execute path blocked on owner policy. |
| D-P2-001 | P2 | Shared physical S3 bucket prefixes | ACCEPTED_RISK | Owner-approved migration only. |
| D-P2-002 | P2 | Limited browser E2E automation | FIXED_LOCAL | Docker Chromium covers review-confirm + financial-intelligence design-system journey; full authenticated tenant browser path still deferred. |
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
