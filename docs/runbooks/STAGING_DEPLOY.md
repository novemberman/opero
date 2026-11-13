# Staging deployment runbook

**Do not deploy without owner approval.** This runbook assumes Railway access is available.

1. Create Railway project `opero-staging` with private Postgres + Redis.
2. Provision S3-compatible buckets: `opero-stg-quarantine`, `opero-stg-documents`, `opero-stg-reports` (private).
3. Create services from `deploy/railway/services.json` using Dockerfiles under `deploy/docker/`.
4. Set variables from `.env.staging.example` (real secrets via Railway dashboard only).
5. Set `APP_ENV=staging`, `NODE_ENV=production`, `TRUST_PROXY=true`, `DOCUMENT_STORAGE_DRIVER=s3`.
6. Run one-off migrate: `pnpm migrate:deploy` (or API pre-deploy command).
7. Deploy `opero-api`, then `opero-worker`, then `opero-web`.
8. Smoke: `/api/v1/health`, `/api/v1/ready`, `/health`, register/login, document upload (mock or test payments only).
9. Configure Korapay **test** webhook URL to `https://<api>/api/v1/billing/webhooks/korapay`.
