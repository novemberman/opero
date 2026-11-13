# Rollback runbook

1. In Railway, redeploy the previous successful deployment for web, API, and worker (same SHA).
2. Do **not** reverse Prisma migrations automatically. Prefer roll-forward fixes.
3. If a migration must be undone, restore from the pre-deploy database backup taken before `migrate deploy`.
4. Invalidate bad client caches if needed; verify `/api/v1/ready` and `/health`.
5. Confirm Korapay webhook still points at the active API hostname.
