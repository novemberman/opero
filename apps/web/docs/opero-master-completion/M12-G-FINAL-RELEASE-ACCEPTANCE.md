# M12-G FINAL RELEASE ACCEPTANCE

**Date:** 2026-11-17  
**Authorization:** Autonomous local development + isolated rehearsal only  
**Verdict:** **PASS**

| Item | Value |
|------|--------|
| Feature commit SHA | `514c37b2a193d5ac8c204e1f09e3cf4ad2fcc467` |
| Tip SHA | `ebe6b7aec40dda2d0b58eff5514544f357c00c02` |
| Migration | **None** |
| Production | **Not deployed** · no grants · no payments |

---

## Entitlement scope behavior (verified)

| Capability | Required for | Synthetic grantable? | Independent? |
|------------|--------------|----------------------|--------------|
| `xray.report_generate` | Publish / PDF **generation** | **Yes** | Yes |
| `xray.pdf_download` | Published PDF **download** | **Yes** | Yes |
| `xray.full_report` | Full published payload view | **No** (never synthetic) | N/A |
| Paid X-Ray Pro | Grants generate + full + download together | Via PURCHASE only | Bundle |

Publication does **not** imply download. `hasEntitlement` is a live DB query (no entitlement cache). Revocation sets `revoked_at` and immediately denies subsequent checks.

---

## Test evidence

| Suite | Result |
|-------|--------|
| M12-G gate + IT + env + csrf | **41 PASS** |
| Reports IT + billing IT + pilot invite + ops status | **28 PASS** |
| API typecheck | **PASS** |

Rehearsal covered: disabled-by-default → OWNER denied → non-allowlisted denied → issue generate → publish → download denied → issue pdf_download → authorized PDF (`%PDF-` + hash) → revoke download → deny → revoke generate → no payments → issuance shutdown still allows revoke → re-disable issue blocked.

---

## Security findings

| ID | Finding | Disposition |
|----|---------|-------------|
| S1 | Dual secrets use `timingSafeStringEqual` (SHA-256 digests) | PASS |
| S2 | Issuance requires flag+window; revoke remains available when flag off (allowlist + dual secrets) | PASS — emergency policy |
| S3 | No entitlement cache after revoke | PASS — live Prisma read |
| S4 | CSRF exempt ops path; mitigated by dual tokens + throttle | Accepted (ops M2M) |
| S5 | `xray.full_report` never issued synthetically | Intentional |
| S6 | Rotate ops + confirmation secrets after production acceptance window | Owner procedure |

---

## Deployment dependencies

1. Deploy API build containing this feature commit (shared package included).  
2. Configure `OPS_STATUS_TOKEN`, `SYNTHETIC_ENTITLEMENT_CONFIRMATION_TOKEN`.  
3. Set `SYNTHETIC_ENTITLEMENT_ORG_IDS` to pilot org only.  
4. Optional short `SYNTHETIC_ENTITLEMENT_EXPIRES_AT`.  
5. Do **not** enable until M12-F window: leave `SYNTHETIC_ENTITLEMENT_ENABLED=false`.

## Production feature-flag plan

1. Owner authorizes timed enable.  
2. `SYNTHETIC_ENTITLEMENT_ENABLED=true` for acceptance only.  
3. Issue `xray.report_generate` then (if PDF retrieval needed) `xray.pdf_download` separately.  
4. Run M12-F publish + PDF acceptance.  
5. Revoke both codes.  
6. Set `SYNTHETIC_ENTITLEMENT_ENABLED=false` immediately.  
7. Rotate confirmation token (and ops token if policy requires).

## Expiration and revocation

- Grant TTL ≤ 24h (`valid_until` honored by resolver).  
- Feature window via `SYNTHETIC_ENTITLEMENT_EXPIRES_AT` blocks **issuance** only.  
- **Revoke** works while issuance is shut down (flag false / window closed) if allowlist + dual secrets remain.  
- Soft revoke only — no deletion of grants, reports, or audits.

## Rollback

1. Disable flag / expire window.  
2. Revoke any active synthetic grants.  
3. Redeploy prior API if needed (no migration reverse).  

---

## Verdict

**PASS** — minimum synthetic capabilities for production publication **and** PDF retrieval acceptance are ready locally, without bypassing commercial authorization.

**STOP FOR OWNER REVIEW.**
