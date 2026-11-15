# PR-1 Production Isolation Blueprint

**Status:** Design only — **do not provision** production resources until owner authorization.  
**Date:** 2026-11-15  
**Baseline staging:** API/Web `cc7041f`, Worker `d301cb3`

---

## 1. Isolation principles

| Rule | Enforcement |
|------|-------------|
| Separate Railway **production** project | Manual create; never reuse staging project |
| Separate PostgreSQL | New production DB service; no restore of staging dumps |
| Separate Redis | New production Redis; empty queues |
| Separate private R2 bucket/namespace | Distinct `S3_*_BUCKET` names; staging keys never copied |
| Separate secrets | Distinct Railway variable groups; rotate independently |
| Production domains | Owner-approved hosts only (placeholders until chosen) |
| Production Korapay | `sk_live_` + live webhook URL only in production project |
| Dedicated monitoring | Separate uptime checks / log views for production |
| Backups & rollback | See §7 |

**Hard bans**

- `PAYMENT_PROVIDER=mock` forbidden in production (`parseApiEnv`).
- Mock settlement routes return **404** when provider ≠ mock **and** when `APP_ENV=production`.
- Production secrets must never be pasted into staging variables.
- Staging test data / DB dumps must never be copied into production.

---

## 2. Proposed Railway topology

```
Railway Project: opero-production          Railway Project: opero-staging (existing)
├── api (production)                       ├── api
├── web (production)                       ├── web
├── worker (production)                    ├── worker
├── Postgres (production)                  ├── Postgres
└── Redis (production)                     └── Redis
```

External:

- R2: `opero-prod-quarantine`, `opero-prod-documents`, `opero-prod-reports` (names TBD by owner).
- Domains: `[PRODUCTION_WEB_DOMAIN]`, `[PRODUCTION_API_DOMAIN]` (or same-origin reverse proxy).
- Korapay dashboard: production merchant + webhook `https://[PRODUCTION_API_DOMAIN]/api/v1/billing/webhooks/korapay`.

---

## 3. Production environment checklist (when authorized)

| Variable | Production expectation |
|----------|------------------------|
| `APP_ENV` | `production` |
| `NODE_ENV` | `production` |
| `PAYMENT_PROVIDER` | `korapay` |
| `KORAPAY_SECRET_KEY` | `sk_live_…` (never `sk_test_`) |
| `DOCUMENT_STORAGE_DRIVER` | `s3` |
| `DOCUMENT_SCANNER_DRIVER` | `clamav` |
| `MAIL_DRIVER` | `resend` |
| `COOKIE_SECURE` | true / unset |
| `TRUST_PROXY` | true |
| `ENABLE_API_DOCS` | unset or `false` (default off) |
| `PILOT_MODE` | `true` for invitation-only pilot |
| `PUBLIC_REGISTRATION_ENABLED` | `false` when `PILOT_MODE=true` |
| `EMERGENCY_DISABLE_*` | `false` unless incident |

Staging must keep `sk_test_` / mock as today; never set production live keys there.

---

## 4. Domain & cookie plan

1. Prefer **same-origin** web→API (`/api/v1` proxy) on production web domain to preserve session cookies.
2. If split hosts: configure `COOKIE_DOMAIN`, `CORS_ORIGINS`, `APP_ORIGIN` together; validate login CSRF before invitees.
3. TLS termination via Railway / CDN; HSTS set by API when `APP_ENV=production`.

---

## 5. Korapay production cutover (future — not this PR)

1. Complete KYC / live activation with Korapay.
2. Create production webhook secret/key pair in production project only.
3. Run a **₦1 live smoke** on a non-customer org after owner approval (Increment C / later).
4. Keep staging on mock or `sk_test_` indefinitely.

---

## 6. Monitoring attachment points

- Uptime: `GET /api/v1/health`, `GET /api/v1/ready`, `GET /api/v1/ops/status`.
- Worker: Railway process health + queue `failed` counts from ops status.
- Alert routing: **owner-approved contacts only** — not configured in-repo (see monitoring plan).

---

## 7. Backups and rollback

| Asset | Backup | Rollback |
|-------|--------|----------|
| Postgres | Railway automatic snapshots + owner-approved offsite export cadence | Redeploy previous image; restore snapshot only with written approval |
| Redis | Ephemeral — acceptable loss of in-flight jobs | Drain / flush not required for rollback |
| R2 | Versioning / lifecycle TBD by owner | Do not sync staging objects into prod |
| App images | Git SHA pinned on Railway deploy | `railway redeploy --commit <sha>` per service |

**Data migration ban:** no `pg_dump` from staging → production. Seed catalog/pricing via migrations/seeds only.

---

## 8. Owner decisions required before provision

1. Production Railway project name and billing account.
2. `[PRODUCTION_WEB_DOMAIN]` / `[PRODUCTION_API_DOMAIN]`.
3. R2 account + bucket names.
4. Korapay live merchant readiness date.
5. Backup retention period and restore drill owner.
6. Whether production starts in `PILOT_MODE=true` (recommended).
