# Database migration runbook

## Allowed

- `pnpm migrate:deploy` → `scripts/migrate-deploy.mjs` (advisory lock + `prisma migrate deploy` + status)
- `pnpm migrate:status`

## Forbidden on deployed databases

- `prisma migrate reset`
- `prisma db push`
- Concurrent migrate jobs from multiple replicas

## Procedure

1. Take a backup / snapshot.
2. Confirm schema compatibility (additive migrations preferred).
3. Run a single migrator with `DATABASE_URL` pointing at the target.
4. If lock busy (exit 2), wait and retry once.
5. On failure: do not start new app replicas; restore backup if deploy cannot roll forward.

## Additive enum migrations (e.g. FinancialConcept)

- Prefer `ALTER TYPE … ADD VALUE` only. Never rename or remove enum labels in the same release.
- Apply the migration **before** any service writes the new labels (API `preDeployCommand` is the sole migrator).
- Deploy order for enum-expanding releases: **API (migrate) → worker → web**.
- Prevent worker-before-migrate races: keep worker wait-for-deploy / manual promote until API pre-deploy succeeds; do not enable independent worker auto-deploy on the same commit when a pending migration adds enum values the worker can persist.
- Rollback redeploys prior **service images** only. Do not attempt to drop PostgreSQL enum values.
