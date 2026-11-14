# Staging deployment runbook

**Do not deploy without owner approval.** This runbook assumes Railway access is available.

1. Create Railway project `opero-staging` with private Postgres + Redis.
2. Provision S3-compatible buckets: `opero-stg-quarantine`, `opero-stg-documents`, `opero-stg-reports` (private).
3. Create services from `deploy/railway/services.json` using Dockerfiles under `deploy/docker/`.
4. Set variables from `.env.staging.example` (real secrets via Railway dashboard only).
5. Set `APP_ENV=staging`, `NODE_ENV=production`, `TRUST_PROXY=true`, `DOCUMENT_STORAGE_DRIVER=s3`.
6. On `opero-web`, set `API_PROXY_TARGET` to the API origin (public or private). Leave browser on same-origin `/api/v1` (default). Set API `CORS_ORIGINS` / `APP_ORIGIN` to the **web** HTTPS origin. Do **not** set `COOKIE_DOMAIN` on Railway default domains.
7. Run one-off migrate: `pnpm migrate:deploy` (or API pre-deploy command).
8. Deploy `opero-api`, then `opero-worker`, then `opero-web`.
9. Smoke: API `/api/v1/health` + `/api/v1/ready`, web `/health`, page source `__OPERO_PUBLIC_ENV__` shows `"apiBaseUrl":"/api/v1"`, register/login, **create organization**, sign out, document upload (mock or test payments only).
10. Configure Korapay **test** webhook URL to `https://<api>/api/v1/billing/webhooks/korapay`.
