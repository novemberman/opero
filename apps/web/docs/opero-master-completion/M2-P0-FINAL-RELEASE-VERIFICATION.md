# M2-P0 FINAL RELEASE VERIFICATION

**Date:** 2026-11-17  
**Verdict: PASS**  
**Release candidate SHA (web behavior):** `86dc4b2d0eb55dfe66ba4573c7b3fd324913a77a`  
**Local tip:** deploy `HEAD` on this branch (docs stamps may sit atop the release SHA)  
**Prior blocked tip:** `163e078a2fbe54ef1a81bebe255a2e5cc642fafd`  
**Production baseline:** API `bc1567a70c54a16c776390f887d8ca9cb8636859` · Web `f59e65e6f220f96f58d08868a75aaa4d91bc384a`

No push. No deploy. No production record mutation. No payments. No upload/checkout enablement.

---

## Verdict summary

| Gate | Result |
|------|--------|
| Five-commit (+ follow-up) git audit | **PASS** — web-only RC; no secrets; no history rewrite |
| Docker Chromium Confirm → CSRF → POST → CONFIRMED | **PASS** |
| Docker Chromium session-expiry curated copy | **PASS** |
| Failed request leaves figure PENDING | **PASS** |
| Duplicate-click → single POST | **PASS** |
| Vitest / typecheck / build | **PASS** |
| API compatibility for Confirm UX vs prod API `bc1567a` | **PASS** — web-only deploy |
| Safety / pilot unchanged by this gate | **PASS** (read-only; no prod mutations) |

---

## 401 UX fix

`classifyReviewHttpFailure` now **always** returns curated copy for HTTP 401, ignoring raw API bodies such as `"Unauthorized"`:

> Your session has expired. Please sign in again. Your confirmation was not saved.

Successful confirmation path and API contract unchanged.

---

## Browser acceptance (Docker Chromium)

Runner: `mcr.microsoft.com/playwright:v1.56.1-jammy` · `--network host` · app `127.0.0.1:3010` · synthetic specimen + mocked APIs.

```
Running 3 tests using 1 worker
  ✓ Confirm figure issues POST /review with CSRF and persists CONFIRMED
  ✓ failed review shows session-expiry copy and does not mark CONFIRMED
  ✓ duplicate clicks while submitting issue a single review POST
  3 passed
```

---

## Local suites

| Suite | Result |
|-------|--------|
| `@opero/web` vitest | **97 passed** (20 files) |
| Web typecheck | **PASS** |
| Web `next build` | **PASS** |

---

## Deployment scope

**Web only** against production API `bc1567a`. No API redeploy, no migrations, emergencies remain on.

Full inventory, SHA, rollback: `M2-P0-WEB-RELEASE-READY.md`.

**STOP FOR OWNER REVIEW.**
