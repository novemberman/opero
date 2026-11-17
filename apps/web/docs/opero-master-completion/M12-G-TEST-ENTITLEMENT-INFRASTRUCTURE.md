# M12-G RESTRICTED SYNTHETIC ENTITLEMENT INFRASTRUCTURE

**Date:** 2026-11-17 (final hardening)  
**Authorization:** Autonomous LOCAL development + isolated rehearsal testing only  
**Verdict:** **PASS**  
**Companion:** `M12-G-FINAL-RELEASE-ACCEPTANCE.md`

| Item | Value |
|------|--------|
| Local feature SHA | `514c37b2a193d5ac8c204e1f09e3cf4ad2fcc467` |
| Migration | **None** |
| Production | **Not deployed** |

---

## Entitlement semantics (Phase 1)

| Check | Result |
|-------|--------|
| Publication | `xray.report_generate` via `canGenerateReport` |
| PDF generation | Same gate — PDF bytes produced inside publish |
| PDF download | Independent `xray.pdf_download` via `canDownloadPdf` |
| Paid X-Ray Pro | Grants generate + full_report + pdf_download together (`XRAY_PRO_ENTITLEMENTS`) |
| Independence | Publish success ≠ download authorization |
| Revocation | Soft `revoked_at`; live DB read on every check (no cache) |

---

## Mechanism (final)

### Endpoints

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/v1/ops/synthetic-entitlements` | Issue one code (`xray.report_generate` \| `xray.pdf_download`) |
| `POST` | `/api/v1/ops/synthetic-entitlements/revoke` | Soft-revoke that code |

Body requires `code` for both operations.

### Auth

1. `X-Ops-Token` = `OPS_STATUS_TOKEN`  
2. `X-Synthetic-Entitlement-Confirmation` = confirmation secret  
3. **Issue:** also requires `SYNTHETIC_ENTITLEMENT_ENABLED=true` + allowlist + optional window  
4. **Revoke:** dual secrets + allowlist only — remains available when issuance is shut down  

OWNER sessions cannot self-issue.

### Grant row

- `sourceType=MANUAL`, `sourceId=synthetic_test:{org}:{report}:{code}`  
- Report scope, TTL 1–24h, auditable, idempotent, no payments  

### Emergency policy

| Action | Flag OFF |
|--------|----------|
| Issue | **403** `SYNTHETIC_ENTITLEMENT_DISABLED` |
| Revoke | **Allowed** (dual secrets + allowlist still configured) |

---

## Rehearsal

See final acceptance — generate → publish → download denied → pdf_download → PDF OK → revoke download → deny → revoke generate → shutdown revoke still works.

---

## Env

| Variable | Default |
|----------|---------|
| `SYNTHETIC_ENTITLEMENT_ENABLED` | `false` |
| `SYNTHETIC_ENTITLEMENT_ORG_IDS` | unset (required when enabling) |
| `SYNTHETIC_ENTITLEMENT_EXPIRES_AT` | optional |
| `SYNTHETIC_ENTITLEMENT_DEFAULT_TTL_HOURS` | `2` (max 24) |
| `SYNTHETIC_ENTITLEMENT_CONFIRMATION_TOKEN` | unset (required when enabling) |
| `OPS_STATUS_TOKEN` | required when enabling |

Ops status exposes `issuanceOpen`, `revocationAvailable`, `capabilities`.

---

**STOP FOR OWNER REVIEW** — see `M12-G-FINAL-RELEASE-ACCEPTANCE.md` for SHAs and deploy plan.
