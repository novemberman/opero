# Opero agent handoff

Date: 2026-11-12 (Phase 4 document ingestion — final checkpoint)
Workspace: `/home/opero/projects/opero`
Branch: `main`
Remote: private GitHub repository `novemberman/opero` (`git@github.com:novemberman/opero.git`)
Phase: **Phase 4 Secure Document Ingestion & Financial Evidence Extraction** validated for commit.

## Phase status

| Phase | Status |
| --- | --- |
| Phase 2 monorepo foundation | Committed as `f8895ad` |
| Phase 3 identity / orgs / tenant security | Committed as `2a8d76e` |
| Phase 4 document ingestion / evidence | Validated; commit `feat: implement Opero X-Ray document ingestion` |

## Phase 4 notes

| Area | Status |
| --- | --- |
| Prisma document/evidence models + migration | Done (`20261112230000_phase4_document_ingestion`) |
| API-mediated upload (20 MB) | Done |
| Private storage abstraction | `filesystem` (local MVP) + `s3` + `memory` (tests) |
| ClamAV scanner (fail closed) + mock driver | Done |
| BullMQ `documents` queue + state machine | Done |
| CSV / XLSX / PDF extraction + evidence | Done (no OCR / no AI) |
| Review UI | `/organizations/[orgId]/documents` |
| Postgres RLS | **Not** enabled |

### Storage note

Official MinIO images were not pullable here; `cleanstart/minio` failed volume permissions. Local default is `DOCUMENT_STORAGE_DRIVER=filesystem` under `.data/object-storage` (gitignored). `S3ObjectStorage` remains for managed S3-compatible providers.

### Residual / production risks

- **No Postgres RLS** — tenant isolation is service-layer only.
- **No automated retention purge** — soft-delete + `retentionUntil` metadata exist; no scheduled object purge job.
- **Durable object storage** — local MVP uses gitignored filesystem under `.data/object-storage`; production should use durable S3-compatible storage (`DOCUMENT_STORAGE_DRIVER=s3`).
- **No PDF OCR** — text-heuristic extraction only; image-only PDFs need manual review.
- ClamAV fail-closed can block processing when the daemon is down (~1 GB RSS on small hosts).
- In-process malware mock is required for deterministic tests (`DOCUMENT_SCANNER_DRIVER=mock`).
- `docker compose` CLI may be permission-denied for the current user; infra can still be healthy via already-running containers on loopback.

### Acceptance audit (2026-11-12)

| Gate | Result |
| --- | --- |
| Baseline HEAD | `2a8d76e` on `main` (unchanged; Phase 4 uncommitted) |
| Live E2E (real ClamAV + worker) | **14/14** (`scripts/phase4-live-acceptance.mjs`) |
| `pnpm lint` / `typecheck` / `test` / `build` | pass |
| Automated tests (all packages) | **77** passed |
| Prisma validate + migrate status | valid; up to date (3 migrations) |
| Web / API health | `ok` |
| Fail-closed (scanner unavailable) | Covered by unit + integration (live script uses healthy ClamAV) |
| Commit / push | Final checkpoint in progress |

### Defects corrected during audit

- Shared filesystem storage root across API/worker (`resolveStorageRoot`)
- Extractions blocked until `scanStatus=CLEAN`
- Soft-delete removes object bytes best-effort + retention metadata in audit
- `@opero/database` runtime packaging (`dist` + `tsx` loader) so Nest CJS can load Prisma 7
- Ambiguous currency/period/scale → warnings; missing amounts not invented as zero
- Live EICAR via XLSX/ZIP container (plain CSV embedding not detected by this ClamAV build)

## Exact next steps (owner-gated)

1. Do not start Phase 5 (AI scoring), billing, or Railway deploy until approved.
2. Prefer `pnpm db:migrate`. Never `migrate reset` unless explicitly requested.
3. Before production: enable durable S3 storage, plan retention purge, and evaluate RLS.
