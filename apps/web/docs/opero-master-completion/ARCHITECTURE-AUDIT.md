# Architecture Audit (M1)

**Date:** 2026-11-17  
**Repo:** `/home/opero/projects/opero`  
**Baseline SHA:** `bc1567a70c54a16c776390f887d8ca9cb8636859`

## Monorepo map

| Unit | Role |
|------|------|
| `apps/api` | NestJS HTTP API: auth, orgs, documents, readiness, diagnostics, AI, reports, billing, pilot ops |
| `apps/web` | Next.js App Router UI + same-origin `/api/v1` proxy |
| `apps/worker` | BullMQ processors: document scan/extract, report generation |
| `packages/database` | Prisma schema + 14 migrations |
| `packages/shared` | Zod contracts, permissions, processing progress |
| `packages/document-processing` | Extractors, scale, validation |
| `packages/object-storage` | S3/memory storage + malware scanner ports |
| `packages/diagnostics` | KPIs, health score, readiness assess, eligibility |
| `packages/ai` | Prompting, grounding, structured interpretation |
| `packages/reports` | Report assembly + PDF |
| `packages/payments` | Korapay/mock providers, webhooks, money helpers |

## Core journey (implemented)

1. Register / verify / login (session + CSRF) → org membership RBAC  
2. Document upload → quarantine → ClamAV/mock scan → promote  
3. Extract statements + evidence → `REVIEW_REQUIRED` when scale/manual/quality gates fire  
4. Human review `POST …/documents/:id/review` → `extraction_reviews` + audits  
5. Readiness `POST …/readiness/assess` (blocking on material pending confirms)  
6. Diagnostics run → deterministic KPIs + Business Health Score  
7. AI interpretation grounded in verified metrics  
8. Report create/generate/PDF → entitlement-gated download  
9. Billing checkout → webhook settlement → entitlements (emergency gates apply)

## AuthZ model

- Session cookie + CSRF double-submit  
- Same-origin web proxy binds cookies to web host (critical on Railway multi-host)  
- Guards: `SessionAuthGuard`, `OrgMembershipGuard`, `PermissionsGuard`  
- Permissions include `xray:read|write|publish`, `billing:manage`, etc.

## Status systems (do not conflate)

| Layer | Values / meaning |
|-------|------------------|
| Document `processingStatus` | QUARANTINED → SCANNING → EXTRACTING → `REVIEW_REQUIRED` \| `READY` \| FAILED/REJECTED |
| Line `reviewStatus` | PENDING / CONFIRMED / REJECTED (+ legacy CORRECTED) |
| Readiness assessment | READY / PARTIALLY_READY / ACTION_REQUIRED / BLOCKED |
| Report / payment statuses | Separate product state machines |

## Dependency order (completion)

1. Confirm UX + review persistence (M2) ← **done locally**  
2. Document status reconcile after confirms (M2) ← **done locally**  
3. Readiness / diagnostics validation (M3) ← suites green  
4. AI grounding validation (M4) ← suites green  
5. Reports PDF/lifecycle (M5) ← suites green  
6. Billing mock + owner Korapay gates (M6) ← mock green; live blocked  
7. CX polish (M7)  
8. Security/ops docs (M8)  
9. E2E acceptance evidence (M9)  
10. Launch readiness (M10)

## Test inventory (executed this program)

| Suite | Result |
|-------|--------|
| `@opero/web` vitest | 89 passed |
| `@opero/diagnostics` | 65 passed |
| `@opero/ai` | 151 passed |
| `@opero/reports` | 61 passed |
| API documents CONFIRM acceptance | passed |
| API readiness + billing + security integration | 28 passed |

## Risks

- Production web SHA lags API (Confirm UX not deployed).  
- Shared physical object bucket with prefix isolation (operational/security tradeoff).  
- Korapay hosted checkout settlement unresolved externally.  
- Sticky document badge previously confused operators (now reconciled locally after material confirms).
