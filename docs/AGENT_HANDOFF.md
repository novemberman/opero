# Opero agent handoff

Date: 2026-11-12 (Phase 3 security hardening + checkpoint)
Workspace: `/home/opero/projects/opero`
Branch: `main`
Remote: private GitHub repository `novemberman/opero` (`git@github.com:novemberman/opero.git`)
Phase: **Phase 3 Identity, Organizations & Tenant Security** — hardening complete; await owner review after checkpoint.

## Phase status

| Phase | Status |
| --- | --- |
| Phase 2 monorepo foundation | Committed as `f8895ad` |
| Phase 3 identity / orgs / tenant security | Hardened; checkpoint pending / in progress |

## Phase 3 security notes

| Requirement | Status |
| --- | --- |
| Argon2id (`m=65536`, `t=3`, `p=1`) | Done |
| Hashed, expiring, single-use verify/reset tokens | Done |
| Session cookies HttpOnly + SameSite=Lax; Secure in production | Done |
| Login session rotation / fixation protection | Done |
| CSRF + CORS allowlist | Done |
| Auth rate limiting | `AUTH_THROTTLE_DISABLED` (forbidden in production) + `LoginRateLimitGuard` |
| Tenant isolation | Service-layer only — **Postgres RLS is not enabled** |
| Concurrent final-owner protection | Serializable + `SELECT … FOR UPDATE` on owner rows |
| Audit append-only; no public mutate API | Done |
| Dev mail | Writes under `MAIL_DIR` only; no public token endpoints |

### Residual risks (service-layer isolation)

- Any future query that omits `organizationId` scoping can leak cross-tenant data.
- Background jobs must use `assertTenantJobContext` and only enqueue after API membership checks.
- Dev mail files on disk contain raw tokens — keep `MAIL_DIR` private and gitignored.

## Manual configuration

- `DATABASE_URL`, `CSRF_SECRET` (≥32 chars), `APP_ORIGIN`
- `SESSION_COOKIE_NAME`, `CSRF_COOKIE_NAME`, TTLs, `MAIL_DIR`
- `AUTH_THROTTLE_DISABLED`, `AUTH_LOGIN_THROTTLE_LIMIT`, `AUTH_LOGIN_THROTTLE_TTL_MS`

## Exact next steps (owner-gated)

1. Review Phase 3 security completion report and approve baseline.
2. Only then begin document ingestion / X-Ray / AI / billing (Phase 4+).
3. Prefer `pnpm db:migrate`. Never `migrate reset` unless explicitly requested.
