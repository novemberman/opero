# Opero agent handoff

Date: 2026-11-14 (Phase 8 extraction intelligence & live processing — awaiting owner review)
Workspace: `/home/opero/projects/opero`
Branch: `main`
Remote: private GitHub repository `novemberman/opero` (`git@github.com:novemberman/opero.git`)
Phase: **Phase 8** Financial Extraction Intelligence & Live Processing Experience. **Do not deploy until owner approves.**

## Phase status

| Phase | Status |
| --- | --- |
| Staging CSRF / same-origin API proxy | in ancestry |
| Phase 8 extraction + live processing | Implemented locally — commit for owner review |

## Phase 8 notes

| Area | Status |
| --- | --- |
| NGN / ₦'000 scale detection | Implemented; ambiguous/missing scale requires review |
| Quantity classification | Percentages/ratios/dates excluded from monetary concepts |
| Concept mapping | Expanded aliases; gross margin no longer maps to GROSS_PROFIT |
| Consistency checks | A=L+E, gross profit identity, insufficient-evidence states |
| Progress contract | `buildProcessingProgress` + status API + polling UI |
| Netshift FY2025 fixture | Synthetic CSV (original not in repo) |
| Migration | `20261114180000_phase8_extraction_intelligence` (additive) |

### Residual / owner-gated

- Apply migration to staging (`opero` + any test DBs) before deploying API/worker
- Smoke: upload Netshift-like CSV → progress timeline → review scale/figures → diagnostics
- Do not auto-redeploy or push without approval
- OCR for scanned PDFs remains out of scope (MANUAL_REQUIRED)

## Exact next steps (owner-gated)

1. Review Phase 8 deliverables report.
2. Approve migration + staging deploy of api, worker, web.
3. Run staging acceptance checklist in `docs/PHASE8_EXTRACTION_AND_LIVE_PROCESSING.md`.
