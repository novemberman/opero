# M3–M5 INTEGRATED LOCAL RELEASE MANIFEST

**Date:** 2026-11-17  
**Integrated verdict: PASS** (local financial intelligence journey)  
**Production deploy: NOT AUTHORIZED**  
**Boundary: STOP FOR OWNER REVIEW**

---

## Release candidate

| Field | Value |
|-------|--------|
| Feature RC | `4f7b19361f1cab0fa073b61f8bbdb5e24b00f634` |
| Docs stamp tip | *(this commit — see ledger)* |
| Prior M3 feature | `fe7eed6c02b42c7cef5b8582149eaf4869b14b76` |
| Prior M3 docs tip | `a8175592719f503a6cf331b9b8367ee35baf5eb6` |
| Migrations | **None** |
| Production mutations | **None** |

---

## Journey validated (local)

1. READY statement eligibility (M3 READY gate)  
2. Financial diagnostics + metrics (`calc.v1`)  
3. Business Health Score (`score.v1`) — withheld when ineligible  
4. AI interpretation (`ai.interpret.v2`) — mock/grounded; no invented figures  
5. Professional report assembly + PDF (`@opero/reports`)  
6. Private report storage path (IT memory / processor keying)  
7. Authorized retrieval / FREE_PREVIEW lock  
8. Cross-tenant denial (API IT)  
9. Missing financial inputs → insufficient metrics / withheld score / empty AI sections  
10. AI provider failure → run fails without corrupting diagnostics  
11. Worker retry / final-attempt behaviour (worker AI unit)  
12. Duplicate / conflict generation paths (existing reports + AI 409 conflict IT)

Numerical consistency: package golden + assemble/PDF tests + grounding IT bind statement → diagnostics → AI claims → report model.

---

## Deployment dependencies (when owner authorizes)

| Unit | Required | Notes |
|------|----------|-------|
| `packages/diagnostics` | Yes (M3) | Already in M3 RC |
| `packages/ai` | Yes | v2 schema/prompt/mock |
| `packages/reports` | Yes | BHS components, methodology, NGN sections |
| `packages/shared` | Yes | Narrative contract fields |
| `apps/api` | Yes | Narrative persist, grounding gate, report payload, FREE_PREVIEW access |
| `apps/worker` | Yes | AI job + report render bucket seam |
| `apps/web` | Yes | Narrative/report UI + design-system + E2E |
| DB migrations | **No** | |
| Production OpenAI key | Optional | Mock works without it |
| Billing / checkout | **No** for this RC | Do not enable paid unlock without M6 |

Deploy order (recommended): shared packages → API → worker → web.

---

## Test matrix (this RC)

| Area | Result |
|------|--------|
| `@opero/diagnostics` | 72 PASS |
| `@opero/ai` | 151 PASS |
| `@opero/reports` | 61 PASS |
| API AI + reports + phase6b/c | 31 PASS |
| Worker AI execute unit | 17 PASS |
| `@opero/web` vitest | 99 PASS |
| Web / API / worker `tsc` | PASS |
| Web `next build` | PASS |
| Docker Playwright Chromium (`mcr.microsoft.com/playwright:v1.56.1-jammy`, `--network host`, app `:3010`) | 5 PASS |

---

## Rollback plan

1. Do not push/deploy this tip.  
2. If partially deployed: redeploy prior service tips (API `77ecbf6…` / web `15299f1…` / worker `31749a3…`) or M3-only tip `fe7eed6…` as appropriate.  
3. No migration reverse required.  
4. Published PDFs remain immutable; do not rewrite object keys in place.

---

## External blockers (unchanged)

1. Owner authorize push/deploy.  
2. Live OpenAI (or compatible) credential + cost controls.  
3. Production report generation / S3 reports bucket ops.  
4. Korapay / paid entitlements (M6).  
5. Emergency upload/checkout gates remain on.  
6. D-P0-005 `xray.report_generate` policy.

---

## Docs

- `M3-FINANCIAL-DIAGNOSTICS-ACCEPTANCE.md`  
- `M4-AI-INTERPRETATION-ACCEPTANCE.md`  
- `M5-FINANCIAL-REPORTING-ACCEPTANCE.md`  
- This manifest  
- `MASTER-EXECUTION-LEDGER.md` / `DEFECT-REGISTER.md`
