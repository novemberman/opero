# M6 BILLING AND ENTITLEMENTS — ACCEPTANCE

**Date:** 2026-11-17  
**Verdict: PASS** (local mock settlement) / **BLOCKED** (live Korapay)  
**Authorization:** Autonomous local M6–M10. No push, deploy, live payments, or production config changes.

| Item | Value |
|------|--------|
| Pricing | Unchanged (`launch.v1`: X-Ray Pro ₦15,000; OS Starter ₦25,000; OS Growth ₦65,000) |
| Migration | `20261117120000_m6_report_generate_entitlement` (OS plan rows for `xray.report_generate`) |
| D-P0-005 | **FIXED_LOCAL** |

---

## Policy enforced

| Capability | Entitlement | Notes |
|------------|-------------|-------|
| Free preview (redacted published view) | Implicit / `xray.preview` | No paid codes |
| Draft / review / approve | RBAC only | Free workflow |
| PDF generation / publish | `xray.report_generate` | After integrity gates; before PDF bytes |
| Full published payload | `xray.full_report` | |
| PDF download | `xray.pdf_download` | |
| X-Ray Pro purchase grants | All three paid codes (REPORT scope) | Via `XRAY_PRO_ENTITLEMENTS` |
| OS subscription grants | Includes `xray.report_generate` (ORGANIZATION) | Migration seed |

Browser redirect / unverified provider status **never** grants access (existing verify + webhook re-verify path retained).

---

## Test evidence

| Suite | Result |
|-------|--------|
| `billing.integration.test.ts` | PASS (mock checkout, webhook, refund, chargeback, concurrency) |
| `a12-live-pilot-pricing.integration.test.ts` | PASS |
| Reports IT (publish denied without generate; allowed with grant) | PASS |
| phase6b / phase6c / phase6-workflow | PASS |
| Live Korapay hosted settlement | **Not run** — D-P1-003 BLOCKED_EXTERNAL |

---

## Emergency / pilot gates (preserved)

- `EMERGENCY_DISABLE_CHECKOUT` blocks all checkouts  
- Live pilot allowlist / lock when enabled  
- Production forbids `PAYMENT_PROVIDER=mock`

**STOP FOR OWNER REVIEW** (with M7–M10 pack).
