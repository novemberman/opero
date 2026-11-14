# Operational troubleshooting

| Symptom | Check |
| --- | --- |
| API won't start | Startup env validation (mock payments, filesystem storage, placeholders) |
| `/ready` 503 | Postgres, Redis, or S3 credentials/network |
| Worker exits immediately | Redis PING failure; missing `REDIS_PASSWORD` |
| Cookies missing / `Invalid CSRF token` on org create | Browser must use same-origin `/api/v1` (check `__OPERO_PUBLIC_ENV__`). Set `API_PROXY_TARGET` on web. Unset `COOKIE_DOMAIN` on Railway default hosts. Confirm `COOKIE_SECURE`, `TRUST_PROXY`, `CORS_ORIGINS`=web origin. Do not use cross-origin API URL on `*.up.railway.app`. |
| Cookies missing | `COOKIE_SECURE`, HTTPS origin, `TRUST_PROXY`, CORS/`APP_ORIGIN` |
| Webhook 200 but no entitlement | Signature, `providerEventKey` dedupe, re-verify amount/currency |
| PDF 403 | Entitlement + RBAC; storage key tenant prefix |
| Migrate exit 2 | Another migrator holds advisory lock |
| Build fails on Railway | Confirm Dockerfile path; do not rely on auto monorepo root detection |
| Web UI: unable to reach API / port 3001 | On Railway, set `API_PROXY_TARGET` on **opero-web**. Page source should show `__OPERO_PUBLIC_ENV__` with `"apiBaseUrl":"/api/v1"`. Direct browser calls to a separate API Railway hostname break CSRF. |

Logs use pino with redaction for cookies, passwords, and secrets. Do not log document bodies or AI prompts.
