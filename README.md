# Opero

Opero is an AI-assisted Business Operating System.

## Initial Product: Opero X-Ray

A business diagnostic platform that transforms financial reports into actionable insights, business health scores, and governed improvement plans.

This repository is the platform foundation: a Next.js web app, a NestJS API, a NestJS worker, shared contracts, and PostgreSQL and Redis for local development. Opero X-Ray diagnostics, authentication, payments, and production deployment are later phases.

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
- Web health: http://127.0.0.1:3000/health
- API health: http://127.0.0.1:3001/api/v1/health

The worker has no HTTP port. It connects to Redis and registers a local `heartbeat` job on the `example` queue. That job only echoes a timestamp.

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

`compose.yaml` runs PostgreSQL 17 and Redis 8.

- Host ports default to `127.0.0.1:54329` (Postgres) and `127.0.0.1:63799` (Redis).
- Published ports bind to loopback only.
- Data is stored in the named volumes `opero_postgres_data` and `opero_redis_data`.
- Credentials are read from `.env`. The compose file has no embedded passwords.

To reach the services from a laptop while they run on this machine, forward the loopback ports over SSH. This does not change the server's SSH or firewall configuration:

```bash
ssh -N \
  -L 3000:127.0.0.1:3000 \
  -L 3001:127.0.0.1:3001 \
  -L 54329:127.0.0.1:54329 \
  -L 63799:127.0.0.1:63799 \
  opero@<server>
```

Then use `127.0.0.1` and the same ports on the laptop.

## Tenant isolation

`packages/database` stores organization, user, membership, and audit data. Membership roles are `OWNER`, `ADMIN`, `MEMBER`, and `VIEWER`.

The schema does not enforce tenant isolation. Relationships make an organization scope possible. They do not stop a query from reading another organization's rows. Service code must filter by `organizationId`, and those rules must be tested, before any business API is exposed. There is no authentication in this phase, and users have no credential fields yet.

## Authoring a migration

`pnpm db:migrate` only applies migrations that are already in `packages/database/prisma/migrations`.

To create a new one against the development database:

```bash
pnpm --filter @opero/database exec prisma migrate dev --name <description>
```

Read the SQL before you apply it. If Prisma reports drift, do not reset a database you need to keep.

## Layout

```text
apps/web        Next.js App Router
apps/api        NestJS HTTP API
apps/worker     NestJS BullMQ worker
packages/database
packages/shared
packages/eslint-config
packages/typescript-config
```

## Not in this phase

Authentication, financial-document analysis, AI calls, payments, Railway deployment, and public database endpoints are intentionally absent.
