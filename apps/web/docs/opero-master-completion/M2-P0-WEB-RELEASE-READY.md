# M2-P0 WEB RELEASE READY

**Date:** 2026-11-17  
**Verdict: PASS**  
**Exact release SHA (local tip):** `PENDING_STAMP`  
**Production web still:** `f59e65e6f220f96f58d08868a75aaa4d91bc384a`  
**Production API (compatible, unchanged):** `bc1567a70c54a16c776390f887d8ca9cb8636859`

No push. No deploy. Owner authorization required before production web promotion.

---

## Acceptance checklist

| Criterion | Result |
|-----------|--------|
| Every required Docker Chromium browser test passes | **PASS** (3/3) |
| 401 message exact curated copy | **PASS** |
| Failed requests leave figures PENDING | **PASS** |
| Successful requests persist CONFIRMED | **PASS** |
| No unexpected changes or secrets in release commits | **PASS** |
| No API deployment or migration required | **PASS** |

### Required 401 copy

```
Your session has expired. Please sign in again. Your confirmation was not saved.
```

---

## Browser test results

Isolated runner: `mcr.microsoft.com/playwright:v1.56.1-jammy` (no Hetzner sudo).

| Test | Result |
|------|--------|
| Confirm figure → CSRF → POST `/review` → CONFIRMED; sibling PENDING | **PASS** |
| 401 → session-expiry message; status stays PENDING | **PASS** |
| Duplicate click while submitting → single POST; ends CONFIRMED | **PASS** |

---

## Vitest / typecheck / build

| Suite | Result |
|-------|--------|
| `pnpm test` (`@opero/web`) | **97 passed** / 20 files |
| `pnpm typecheck` | **PASS** |
| `pnpm build` (`next build`) | **PASS** |

Unit regression: `classifyReviewHttpFailure(401, { message: "Unauthorized" })` returns curated session copy.

---

## Git commit inventory (ahead of `origin/main` = `bc1567a`)

| Full SHA | Subject | Role |
|----------|---------|------|
| `da1322e60fe5dd358caefcad7abac018ceac3a31` | fix(review): one-click confirm UX and document status reconcile | Confirm UX + optional API reconcile |
| `3bc2d1955a648c63e9b43c4b8dd607233f31a641` | docs(master): stamp local completion commit SHA | Docs |
| `9993c39965ed60f69efea9784b8c31e8ff039a1f` | fix(security): tighten CSRF exemptions and align upload limits | Optional API hardening (not required for web RC) |
| `430fa49ecb223aa3755a18d79168da796dbb7e25` | fix(review): harden Confirm figure submission and add contract E2E | Submit helper + E2E |
| `163e078a2fbe54ef1a81bebe255a2e5cc642fafd` | docs(m2): stamp review-repair release candidate SHA | Prior RC stamp |
| `PENDING_STAMP` | fix(review): prefer curated 401 session-expiry copy | **This release tip** (401 fix + docs) |

### Changed files in the 401 fix commit

- `apps/web/src/lib/extraction-review-submit.ts`
- `apps/web/src/lib/extraction-review-submit.test.ts`
- `apps/web/e2e/review-confirm.spec.ts`
- `apps/web/docs/opero-master-completion/M2-P0-FINAL-RELEASE-VERIFICATION.md`
- `apps/web/docs/opero-master-completion/M2-P0-WEB-RELEASE-READY.md`

Secrets scan: none in these paths.

---

## Web-only deployment plan (requires owner authorize)

1. Push local tip (not done).
2. Deploy **web only** (`opero-prd-web`) at the exact release SHA above.
3. Set web `APP_VERSION` to that SHA.
4. Leave API on `bc1567a`. Do not change emergencies:
   - `EMERGENCY_DISABLE_UPLOADS=true`
   - `EMERGENCY_DISABLE_CHECKOUT=true`
   - `PILOT_UPLOAD_ENABLED=false`
5. Smoke: OWNER → pilot document → Confirm Revenue → Network CSRF + `POST …/review` 201 → refresh CONFIRMED; siblings PENDING.

**Out of scope:** API/worker deploy, migrations, uploads/checkout enablement, payments, reports, production figure confirmation during this packaging gate.

---

## Rollback procedure

1. Redeploy previous successful web deployment `f59e65e6f220f96f58d08868a75aaa4d91bc384a`.
2. No migration rollback (none).
3. API stays on `bc1567a` for web-only path — no API rollback.
4. If figures were confirmed after a future authorized deploy, retain review/audit rows.

---

## Remaining risks

| Risk | Notes |
|------|-------|
| Prod still on old Confirm UX until deploy | Expected until owner authorize |
| Optional API READY reconcile / CSRF allowlist not deployed | Not required for Confirm POST persistence |
| Live pilot confirmation still owner-operated | This gate used synthetic mocks only |

**STOP FOR OWNER REVIEW.**
