# Opero agent handoff

Date: 2026-11-12 (Phase 2 complete; owner approved VCS checkpoint)
Workspace: `/home/opero/projects/opero`
Branch: `main`
Remote: private GitHub repository `novemberman/opero` (`git@github.com:novemberman/opero.git`)
Phase: **Phase 2 Monorepo Foundation is complete** and approved for version-control checkpointing only. Do not start authentication, tenant enforcement APIs, X-Ray, AI, payments, or Railway until the owner asks.

This file is a handoff for the next Cursor Agent CLI session.

## Phase 2 acceptance checklist

| Requirement | Status |
| --- | --- |
| pnpm workspaces and Turborepo | Done |
| Next.js web application | Done (`apps/web`) |
| NestJS API | Done (`apps/api`) |
| NestJS/BullMQ worker | Done (`apps/worker`, includes `ioredis@6.0.0`) |
| Shared TypeScript and Zod contracts | Done (`packages/shared`) |
| Prisma/PostgreSQL foundation | Done; migration `20261112190000_init` applied |
| Redis infrastructure | Done via Compose |
| Docker Compose development configuration | Done; ports on `127.0.0.1` only |
| Environment validation and `.env.example` | Done |
| Health endpoints | Done (`/health`, `/api/v1/health`) |
| Basic automated tests | Done (20 tests) |
| `pnpm lint` / `typecheck` / `test` / `build` | Passed on 2026-11-12 Phase 2 closeout |

## Tasks completed

- Next.js App Router app at `apps/web` (Tailwind, landing page, `GET /health`)
- NestJS API at `apps/api` (`/api/v1`, health, Zod env validation, Pino logs, global validation pipe, CORS from env, graceful shutdown, `X-Powered-By` disabled)
- NestJS worker at `apps/worker` (BullMQ, Redis from env, graceful shutdown, local `heartbeat` job, unit tests, live Redis connection verified)
- Prisma 7 package at `packages/database` (schema, client factory, applied init migration)
- Zod contracts at `packages/shared`
- Shared TypeScript and ESLint configs
- Docker Compose for PostgreSQL 17 and Redis 8 on loopback
- Root scripts: `pnpm dev`, `build`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`

Not implemented, on purpose: authentication, financial-document analysis, AI calls, payments, public database mutation endpoints, Railway deployment, service-layer tenant isolation enforcement.

## Files in the Phase 2 checkpoint

Source and config included in the foundation commit:

- `README.md`, `.gitignore`, `docs/AGENT_HANDOFF.md`
- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`
- `.nvmrc`, `.editorconfig`, `.npmrc`, `.env.example`, `compose.yaml`
- `apps/web/`, `apps/api/`, `apps/worker/`
- `packages/database/` (including `prisma/migrations/20261112190000_init`)
- `packages/shared/`, `packages/eslint-config/`, `packages/typescript-config/`

Gitignored and never committed:

- `.env` (secrets)
- `node_modules/`, `apps/*/.next`, `apps/*/dist`, `packages/*/dist`
- `packages/database/generated/`
- `.turbo/`, `*.tsbuildinfo`

## Runtime status at Phase 2 closeout

| Component | Status |
| --- | --- |
| `opero-postgres` | Healthy on `127.0.0.1:54329` |
| `opero-redis` | Healthy on `127.0.0.1:63799` |
| Web | `GET http://127.0.0.1:3000/health` → `200` ok |
| API | `GET http://127.0.0.1:3001/api/v1/health` → `200` ok |
| Worker | Running; logs `Opero worker is ready` |
| Migration | `20261112190000_init` applied; `pnpm db:migrate` reports no pending migrations |

Docker note: `opero` is in the `docker` group (`getent group docker` lists `opero`). Existing shells that predate the group change still need a new login, or use `sg docker -c '…'`.

## Known non-blockers

1. ESLint 10 peer warnings from some Next/eslint plugins. Lint exits 0.
2. `@opero/database` exports TypeScript source as ESM. No NestJS app imports it yet. Decide ESM vs build strategy when wiring the first DB consumer (next phase).
3. Tenant isolation is documented in schema/README only. Enforce in service code before any business API.
4. GitHub SSH from this host may fail with `Permission denied (publickey)` for `~/.ssh/opero_github_ed25519` until the deploy/user key is authorized on GitHub.

## Exact next steps (owner-gated)

1. Confirm the Phase 2 checkpoint commit is on `origin/main` (repair GitHub SSH auth on this host if push failed).
2. Only after owner approval, begin the next phase (authentication / tenant isolation / document ingestion / AI). Do not start those without an explicit request.
3. Prefer `pnpm db:migrate` (`prisma migrate deploy`). Never run destructive DB resets unless the owner explicitly asks.
