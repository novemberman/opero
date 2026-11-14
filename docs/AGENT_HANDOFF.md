# Opero agent handoff

Date: 2026-11-14 (Staging CSRF / same-origin proxy repair — awaiting owner review)
Workspace: `/home/opero/projects/opero`
Branch: `main`
Remote: private GitHub repository `novemberman/opero` (`git@github.com:novemberman/opero.git`)
Phase: **Staging CSRF authentication repair**. **Do not deploy until owner approves.**

## Phase status

| Phase | Status |
| --- | --- |
| Phase 7A Nigerian commercialization (Korapay) | in ancestry |
| Phase 7B-1 Railway deployment foundation | in ancestry |
| Phase 7B-2 Resend transactional email | in ancestry |
| Staging CSRF / same-origin API proxy | Implemented locally — commit for owner review |

## CSRF repair notes

| Area | Status |
| --- | --- |
| Root cause | Cross-site `SameSite=Lax` cookies on distinct `*.up.railway.app` hosts; CSRF cookie omitted on POST |
| Fix | Browser uses same-origin `/api/v1`; web proxies to `API_PROXY_TARGET`; Domain stripped from Set-Cookie |
| Sign out | Visible `AuthNav` Sign out using `POST /auth/logout` (revokes session + clears cookies) |
| CSRF hygiene | Client resets token after login / CSRF 403; logout clears CSRF cookie |

### Residual / owner-gated

- Set Railway `opero-web` `API_PROXY_TARGET` to the API origin
- Ensure `CORS_ORIGINS` / `APP_ORIGIN` are the **web** origin
- Unset `COOKIE_DOMAIN` on Railway default domains
- Remove/ignore browser absolute `NEXT_PUBLIC_API_BASE_URL` pointing at a separate API host
- Do not deploy automatically from this change set

## Exact next steps (owner-gated)

1. Review CSRF repair report; approve when ready.
2. Apply Railway variable changes (see staging runbook).
3. Deploy staging only after review; smoke login → create organization → sign out.
