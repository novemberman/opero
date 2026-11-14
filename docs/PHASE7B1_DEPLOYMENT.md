# Phase 7B-1 — Cloud infrastructure & deployment foundation

**Baseline:** `364cc14` (Phase 7A commercialization).  
**Scope:** Prepare reproducible Railway staging/production configuration.  
**Out of scope:** Production deploy, live payments, real customer data migration, Phase 7B-2.

---

## Deployment plan (approved for local implementation)

### Architecture

```
                    ┌─────────────┐
  Browser ─────────►│  opero-web  │  Next.js (public HTTPS)
                    └──────┬──────┘
                           │ NEXT_PUBLIC_API_BASE_URL
                    ┌──────▼──────┐
  Korapay webhook ─►│  opero-api  │  NestJS /api/v1 (public HTTPS)
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           │               │               │
    ┌──────▼─────┐  ┌──────▼─────┐  ┌──────▼──────┐
    │ PostgreSQL │  │   Redis    │  │ S3-compat   │
    │ (private)  │  │ (private)  │  │ private     │
    └────────────┘  └──────▲─────┘  │ buckets     │
                           │        └──────▲──────┘
                    ┌──────┴──────┐        │
                    │opero-worker │────────┘
                    │ (no public  │  BullMQ consumers
                    │  HTTP)      │
                    └─────────────┘
```

| Service | Public? | Role |
| --- | --- | --- |
| `opero-web` | Yes | Browser UI |
| `opero-api` | Yes | Auth, APIs, Korapay webhooks |
| `opero-worker` | No | Document scan, AI, report jobs |
| PostgreSQL | No | Primary data |
| Redis | No | BullMQ + rate limits |
| Object storage | No (presigned/API-only) | Quarantine, documents, reports |

### Build strategy

- **Explicit Dockerfiles** per app (`deploy/docker/Dockerfile.web|api|worker`).
- Multi-stage: `pnpm fetch` → install workspace → build deps → prune → non-root runtime.
- Railway services point at these Dockerfiles (do **not** rely on auto monorepo detection).
- Start commands:
  - web: `node apps/web/scripts/next.mjs start` (or `node_modules/next/...` via script)
  - api: `node --import tsx apps/api/dist/main.js` after migrate job
  - worker: `node --import tsx apps/worker/dist/main.js`
- Migrations run as a **one-off / pre-deploy** job (`scripts/migrate-deploy.mjs`), not concurrently from every replica.

### Environment isolation

| Concern | development | staging | production |
| --- | --- | --- | --- |
| Railway project | n/a (compose) | `opero-staging` | `opero-production` |
| Database | local compose | dedicated PG | dedicated PG |
| Redis | local compose | dedicated Redis | dedicated Redis |
| Buckets | local FS or MinIO | `opero-stg-*` | `opero-prd-*` |
| Payments | `mock` | `korapay` + `sk_test_` | `korapay` + `sk_live_` |
| Mail | `dev` | transactional provider | transactional provider |
| Origins | loopback | staging HTTPS | production HTTPS |
| Secrets | `.env` gitignored | Railway vars | Railway vars |

Promotion: merge reviewed `main` → deploy staging → smoke → promote same image digest / commit SHA to production.  
Rollback: redeploy previous Railway deployment; database roll-forward only (see migration runbook).

### Storage

- Production/staging **require** `DOCUMENT_STORAGE_DRIVER=s3`.
- Ephemeral container FS is forbidden for customer documents and published PDFs.
- Buckets: quarantine, documents (accepted), reports (PDFs).
- Private ACL; API-mediated access; optional SSE-S3; checksum verification on put/get.
- Local validation via MinIO compose profile when credentials unavailable.

### Migration safety

1. Backup (Railway PG snapshot / `pg_dump`).
2. Advisory lock → `prisma migrate deploy` → `prisma migrate status`.
3. Never `migrate reset` / `db push` on deployed DBs.
4. Single migrator job; app replicas wait on readiness.

### Security assumptions

- Railway edge terminates TLS; apps trust `X-Forwarded-*` only behind that proxy.
- Cookies: `Secure` + `HttpOnly` + `SameSite=Lax` in production (cross-subdomain cookie domain optional via `COOKIE_DOMAIN`).
- Worker has no public HTTP; optional loopback readiness only.
- Korapay webhooks remain signature-verified; CSRF-exempt path only.

---

## Railway service configuration

Create three app services + two plugins (Postgres, Redis) **per environment**.

### opero-web

- Dockerfile: `deploy/docker/Dockerfile.web`
- Health: `GET /health`
- Public networking: yes
- Env: `WEB_HOST=0.0.0.0`, `WEB_PORT=$PORT`, `NEXT_PUBLIC_API_BASE_URL`, `APP_VERSION`
- **API URL is runtime-injected** into the HTML (not baked at `next build`). Set `NEXT_PUBLIC_API_BASE_URL` on the Railway **service variables** for `opero-web` (no Docker build-arg required). Example: `https://opero-staging.up.railway.app/api/v1` (origin-only values are normalized to append `/api/v1`). Do not put secrets in `NEXT_PUBLIC_*`.

### opero-api

- Dockerfile: `deploy/docker/Dockerfile.api`
- Health: `GET /api/v1/health` (liveness), `GET /api/v1/ready` (readiness)
- Public networking: yes (webhooks + browser API)
- Private: connect to Postgres, Redis, S3 endpoint
- Pre-deploy / release command: `pnpm migrate:deploy` (one instance)

### opero-worker

- Dockerfile: `deploy/docker/Dockerfile.worker`
- Public networking: **disabled**
- Same private network as API
- Restart: on failure

### PostgreSQL / Redis

- Railway managed plugins; **do not** enable public TCP.
- Inject `DATABASE_URL`, `REDIS_URL` / host+password via references.

---

## Runbooks (summary)

Full checklists live under `docs/runbooks/`:

| Doc | Purpose |
| --- | --- |
| `docs/runbooks/STAGING_DEPLOY.md` | First staging deploy |
| `docs/runbooks/PRODUCTION_PROMOTION.md` | Promote reviewed staging |
| `docs/runbooks/ROLLBACK.md` | Redeploy previous revision |
| `docs/runbooks/DATABASE_MIGRATIONS.md` | Backup → lock → migrate |
| `docs/runbooks/STORAGE_PROVISIONING.md` | Buckets, SSE, rotation |
| `docs/runbooks/TROUBLESHOOTING.md` | Common failures |

---

## Owner provisioning still required

- Railway account / project / environments
- Managed Postgres + Redis (private)
- S3-compatible provider credentials (Cloudflare R2, AWS S3, Railway bucket, etc.)
- Staging + production secrets (CSRF, session, Korapay, AI, mail)
- Custom domains + CORS origins
- ClamAV strategy on Railway (sidecar, external scanner, or approved alternative)

**Do not create paid resources or deploy without explicit owner approval.**
