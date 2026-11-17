# Security Review (M8) — Defensive Summary

**Date:** 2026-11-17  
**Scope:** Local code + production read-only baseline. No offensive testing. No production mutations.

## Controls present

| Area | Finding |
|------|---------|
| AuthN | Session cookies, email verify, password reset tokens |
| CSRF | Required on mutating API; web retries once on CSRF failure |
| AuthZ | Org membership + permission guards on controllers |
| Tenant isolation | Org-scoped queries; cross-tenant review denied in new test (404) |
| Uploads | MIME/size validation, quarantine, malware scan, emergency disable |
| Rate limits | Present on API (observed in production response headers) |
| Secrets | Env-based; not committed (`.env` gitignored) |
| Webhooks | Signature/reference helpers in payments package |
| Audit | `audit_events` + document access events |

## Production safety revalidated

- `EMERGENCY_DISABLE_UPLOADS=true`  
- `EMERGENCY_DISABLE_CHECKOUT=true`  
- `PUBLIC_REGISTRATION_ENABLED=false`  
- `PILOT_UPLOAD_ENABLED=false`  

## Residual risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Shared physical bucket prefixes | P2 | Documented; migration needs owner approve |
| Deploy SHA skew | P1 | Align web/api/worker on next authorized deploy |
| Dependency CVE scan | P2 | Run `pnpm audit` in CI before public launch (not executed as gate here) |

## Local security integration

`src/security/security.integration.test.ts` included in batch → **PASS**.
