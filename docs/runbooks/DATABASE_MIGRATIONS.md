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
