# Operational troubleshooting

| Symptom | Check |
| --- | --- |
| API won't start | Startup env validation (mock payments, filesystem storage, placeholders) |
| `/ready` 503 | Postgres, Redis, or S3 credentials/network |
| Worker exits immediately | Redis PING failure; missing `REDIS_PASSWORD` |
| Cookies missing | `COOKIE_SECURE`, HTTPS origin, `TRUST_PROXY`, CORS/`APP_ORIGIN` |
| Webhook 200 but no entitlement | Signature, `providerEventKey` dedupe, re-verify amount/currency |
| PDF 403 | Entitlement + RBAC; storage key tenant prefix |
| Migrate exit 2 | Another migrator holds advisory lock |
| Build fails on Railway | Confirm Dockerfile path; do not rely on auto monorepo root detection |
| Web UI: unable to reach API / port 3001 | `NEXT_PUBLIC_API_BASE_URL` must be set on **opero-web runtime** vars (not only locally). Confirm page source contains `__OPERO_PUBLIC_ENV__` with the staging/production API URL, not `127.0.0.1:3001`. Include `/api/v1` or rely on origin normalization. Rebuild is not required for URL changes with the runtime injection approach. |

Logs use pino with redaction for cookies, passwords, and secrets. Do not log document bodies or AI prompts.
