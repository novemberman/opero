# Opero

Opero is an AI-assisted Business Operating System.

## Initial Product: Opero X-Ray

A business diagnostic platform that transforms financial reports into actionable insights, business health scores, and governed improvement plans.

This repository is the Opero platform: a Next.js web app, a NestJS API with first-party authentication and tenant-scoped organization APIs, a NestJS worker, shared contracts, and PostgreSQL and Redis for local development. Opero X-Ray includes document ingestion and deterministic financial diagnostics. Payments and production deployment are later phases.

## Stack

- Node.js 24 and pnpm 10
- pnpm workspaces and Turborepo
- Next.js App Router (`apps/web`)
- NestJS (`apps/api`, `apps/worker`)
- BullMQ and Redis
- Prisma 7 and PostgreSQL (`packages/database`)
- Zod contracts (`packages/shared`)

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- pnpm 10.34.9 (`corepack enable && corepack prepare pnpm@10.34.9 --activate`)
- Docker Engine with Compose

## Local setup

From `/home/opero/projects/opero`:

```bash
cp .env.example .env
```

Edit `.env` and replace both `replace-with-local-dev-password` values. Use the same PostgreSQL password in `POSTGRES_PASSWORD` and `DATABASE_URL`, and the same Redis password in `REDIS_PASSWORD` and `REDIS_URL`. These are development credentials. Do not reuse them anywhere else, and do not commit `.env`.

```bash
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

`pnpm db:migrate` applies committed migrations with `prisma migrate deploy`. It does not drop or reset data.

Open:

- Web: http://127.0.0.1:3000
- Register / login: http://127.0.0.1:3000/register · http://127.0.0.1:3000/login
- Web health: http://127.0.0.1:3000/health
- API health: http://127.0.0.1:3001/api/v1/health
- API docs: http://127.0.0.1:3001/api/v1/docs

Development email is written under `.data/mail/` (gitignored). Verification and reset links are not returned in API responses. Swap `EmailPort` for Resend/SES (or similar) in production.

The worker has no HTTP port. It connects to Redis and registers a local `heartbeat` job on the `example` queue. That job only echoes a timestamp. Tenant-scoped jobs must carry a validated `organizationId` (see `apps/worker/src/tenant`).

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Web, API, worker, and shared type watch |
| `pnpm build` | Production build of every package |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript |
| `pnpm test` | Unit tests |
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:migrate` | Apply committed Prisma migrations |

Start one app without the others:

```bash
pnpm --filter @opero/web dev
pnpm --filter @opero/api dev
pnpm --filter @opero/worker dev
```

Infrastructure can stay up on its own:

```bash
docker compose up -d
docker compose ps
docker compose down
```

`docker compose down` stops containers and keeps the named volumes. It does not delete data.

## Development infrastructure

`compose.yaml` runs PostgreSQL 17, Redis 8, and ClamAV (`clamd` on TCP 3310).

- Host ports default to `127.0.0.1:54329` (Postgres), `127.0.0.1:63799` (Redis), and `127.0.0.1:3310` (ClamAV).
- Published ports bind to loopback only.
- Data is stored in named volumes (`opero_postgres_data`, `opero_redis_data`, `opero_clamav_data`).
- Credentials are read from `.env`. The compose file has no embedded passwords.
- Document object storage defaults to a private filesystem root (`.data/object-storage`). Set `DOCUMENT_STORAGE_DRIVER=s3` and the `S3_*` vars when using a managed S3-compatible provider.

To reach the services from a laptop while they run on this machine, forward the loopback ports over SSH. This does not change the server's SSH or firewall configuration:

```bash
ssh -N \
  -L 3000:127.0.0.1:3000 \
  -L 3001:127.0.0.1:3001 \
  -L 54329:127.0.0.1:54329 \
  -L 63799:127.0.0.1:63799 \
  -L 3310:127.0.0.1:3310 \
  opero@<server>
```

Then use `127.0.0.1` and the same ports on the laptop.

## Document ingestion (Phase 4)

Uploads are API-mediated multipart (max 20 MB via `DOCUMENT_MAX_BYTES`). The browser never talks to object storage directly; short-lived download URLs are issued only after authz and a clean scan.

Pipeline: quarantine → ClamAV scan (**fail closed** if the scanner is unreachable) → promote → CSV/XLSX/PDF text extraction → financial concept normalization (`decimal.js` string amounts) → evidence locators → optional human review.

- UI: `/organizations/[orgId]/documents` (VIEWER is read-only; API still enforces `xray:read` / `xray:write`)
- Worker queue: `documents`
- No OCR and no AI extraction in this phase — image-only PDFs go to manual review
- Soft delete marks `deletionStatus=DELETED`, removes object bytes when possible, and records `DOCUMENT_RETENTION_DAYS` metadata. Automated purge of expired rows is not implemented in this phase.
- Filesystem storage is private under `.data/object-storage` (gitignored); API and worker resolve that path from the monorepo root so they share the same tree.

## Tenant isolation and roles

`packages/database` stores organization, user, membership, session, invitation, audit, and document/evidence data. Membership roles are `OWNER`, `ADMIN`, `ANALYST`, and `VIEWER`.

The schema does **not** enable Postgres RLS. The NestJS API derives identity from the server session cookie, verifies membership for `:organizationId`, and enforces an explicit permission matrix. Client-supplied organization ids are never treated as proof of access. Document jobs re-validate tenant context in the worker.

## Authoring a migration

`pnpm db:migrate` only applies migrations that are already in `packages/database/prisma/migrations`.

To create a new one against the development database:

```bash
pnpm --filter @opero/database exec prisma migrate dev --name <description>
```

Read the SQL before you apply it. If Prisma reports drift, do not reset a database you need to keep.

## Layout

```text
apps/web                  Next.js App Router
apps/api                  NestJS HTTP API
apps/worker               NestJS BullMQ worker
packages/database
packages/diagnostics
packages/document-processing
packages/object-storage
packages/shared
packages/eslint-config
packages/typescript-config
```

## Financial diagnostics (Phase 5)

Deterministic KPI / quality / score / findings engine (`@opero/diagnostics`, methodology in `docs/DIAGNOSTIC_METHODOLOGY.md`).

- API: `/organizations/:orgId/diagnostics` (initiate with `xray:write`; read with `xray:read`)
- Worker queue: `diagnostics` / job `diagnostic.run`
- UI: `/organizations/[orgId]/diagnostics`
- Scores use provisional heuristic bands; incomplete evidence yields `INSUFFICIENT_DATA` rather than inventing values
- No generative AI, OCR expansion, billing, or Railway deploy in this phase

## Not in this phase

Generative AI interpretation, OCR, billing, Railway deployment, Postgres RLS, and public mutation of audit records are intentionally absent.
