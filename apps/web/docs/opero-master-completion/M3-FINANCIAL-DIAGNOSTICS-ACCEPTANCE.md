# M3 FINANCIAL DIAGNOSTICS AND BUSINESS HEALTH SCORE — ACCEPTANCE

**Date:** 2026-11-17  
**Verdict: PASS** (local release candidate; production deploy **not** authorized)  
**Authorization:** Autonomous local development / integration testing / release preparation under Master Completion. Production **READ-ONLY**. No prod diagnostic runs, reports, payments, push, or deploy.

| Item | Value |
|------|--------|
| Production API baseline (read-only) | `77ecbf6b4954387888bfda24dc747ac038fa6175` |
| Production web / worker | `15299f1…` / `31749a3…` |
| Local release candidate | `fe7eed6c02b42c7cef5b8582149eaf4869b14b76` (+ docs stamp commit on `main`; not pushed) |
| Migrations | **None** |
| Engine versions | `calc.v1` · `score.v1` · `rules.v1` |

---

## Phase 1 — Engine audit (summary)

Authoritative stack: `@opero/diagnostics` (`buildSnapshot` → `computeMetrics` → `assessQuality` → `computeScore` → `evaluateFindings`) with Nest API persistence and web presentation. Prior gaps vs required checklist: **ROA, ROE, asset turnover, profit growth, margin movement, debt-to-assets, named cash coverage**; start-run allowed `REVIEW_REQUIRED`; web hard-coded `currency: "USD"`.

---

## Implemented metrics (`calc.v1`)

### Profitability
| Code | Formula | Notes |
|------|---------|-------|
| `GROSS_MARGIN` | GP/Rev or (Rev−COGS)/Rev | Existing |
| `OPERATING_MARGIN` | OpProfit/Rev | Existing |
| `NET_MARGIN` | NI/Rev | Existing |
| `RETURN_ON_ASSETS` | NI/TotalAssets | **Added** |
| `RETURN_ON_EQUITY` | NI/Equity | **Added** |
| `REVENUE_GROWTH` | ΔRev / \|prior\| | Existing |
| `PROFIT_GROWTH` | ΔNI / \|prior\| | **Added** |
| `NET_MARGIN_MOVEMENT` | NI/Rev Δ (aligned periods) | **Added** |
| `OPEX_RATIO` / `COGS_RATIO` | Existing extras | |

### Liquidity
| Code | Formula | Notes |
|------|---------|-------|
| `CURRENT_RATIO` | CA/CL | Existing |
| `QUICK_RATIO` | (CA−Inv)/CL | Inventory required; never inferred 0 |
| `WORKING_CAPITAL` | CA−CL | Existing |
| `CASH_RATIO` | Cash/CL | Existing |
| `CASH_COVERAGE` | OCF/Interest | **Added** (cash interest coverage) |

### Solvency (dimension: leverage)
| Code | Formula | Notes |
|------|---------|-------|
| `DEBT_TO_EQUITY` | InterestBearingDebt/Equity | Not total liabilities |
| `DEBT_TO_ASSETS` | InterestBearingDebt/TotalAssets | **Added** |
| `LIABILITIES_TO_ASSETS` | TL/TA | Existing (broader solvency) |
| `INTEREST_COVERAGE` | OpProfit/Interest | Existing |

### Efficiency
| Code | Formula | Notes |
|------|---------|-------|
| `RECEIVABLES_TURNOVER` | Rev/AR | Point-in-time + warning |
| `PAYABLES_TURNOVER` | COGS/AP | Point-in-time; purchases not inferred |
| `ASSET_TURNOVER` | Rev/TotalAssets | **Added** |
| `DSO` / `INVENTORY_*` / `CCC` | Existing | |

### Growth
Revenue growth, profit growth, net margin movement as above (scored under profitability; no separate growth dimension in `score.v1`).

**Missing-data rule:** metrics return `INSUFFICIENT_INPUTS` / `UNDEFINED` / `INCOMPATIBLE` with `value: null` — never silent zero substitution.

---

## Business Health Score (`score.v1`)

| Dimension | Weight |
|-----------|--------|
| Profitability | 25 |
| Liquidity | 20 |
| Leverage | 20 |
| Efficiency | 15 |
| Cash flow | 20 |

- **Deterministic:** same snapshot → same score components/overall.
- **Transparent:** per-component `weight`, `metricCodes`, `exclusionReason`.
- **Versioned:** `SCORE_METHODOLOGY_VERSION = score.v1` persisted on run/score rows.
- **Missing dims:** excluded, **not** renormalized; contribute 0 to Σ(score×weight)/100.
- **Publish gates:** coverage ≥ 0.60, reliability ≥ 0.50, consistency ≥ 0.70, ≥ 3 dimensions.
- **Limitations:** provisional bands (not industry benchmarks); not a credit rating/audit/survival prediction; CONFIRMED-only monetary evidence.
- **AI:** UI never invents numeric scores (`health-score-presentation`).

New metrics optionally contribute to dimension bands when `COMPUTED` (ROA/ROE/profit growth → profitability; cash coverage → liquidity; debt-to-assets → leverage; asset turnover → efficiency).

---

## Golden fixture / integrity

`packages/diagnostics/src/golden-fixture.test.ts` (NGN **ACTUAL ×1**):

- Gross / operating / PBT / net profit identities **PASS**
- Balance sheet equality (TA = TL+Equity = TOTAL_LIABILITIES_AND_EQUITY) **PASS**
- Required metric values reconcile independently **PASS**
- Source `inputRefs` + `formulaId` present **PASS**
- Partial inputs → insufficient, not invented **PASS**
- Engine determinism **PASS**

Quality assessment now flags GP, operating, PBT, net, and BS identity breaks when those B2.2/core concepts are present.

---

## Eligibility & API

| Rule | Result |
|------|--------|
| Start requires `processingStatus=READY` (+ ACTIVE + CLEAN) | **PASS** (API 400 otherwise) |
| Incomplete READY docs → soft `INSUFFICIENT_DATA` | **PASS** |
| Cross-tenant run access denied | **PASS** |
| VIEWER cannot start | **PASS** |
| Immutable snapshot / idempotent re-job hash | **PASS** |
| No report/payment/entitlement from eligibility alone | **PASS** (unchanged commercial surfaces) |
| Web start omits forced USD; only READY docs listed | **PASS** |

---

## UI

- Diagnostics overview + run detail: BHS panel, dimension metrics, findings/evidence, methodology/limitations, loading/error/retry.
- **Added:** missing/undefined/incompatible metric input warning banner on run detail.
- Design-system diagnostics specimen retained.

---

## Test evidence

| Suite | Result |
|-------|--------|
| `@opero/diagnostics` | **72 PASS** (was ~65; + golden fixture) |
| API diagnostics IT | **3 PASS** (incl. READY gate) |
| API readiness IT | **3 PASS** |
| Web presentation (metric/BHS/readiness) | **11 PASS** |
| Typecheck diagnostics / api / web | **PASS** |
| Build diagnostics / api / web | **PASS** |
| Playwright browser E2E | **BLOCKED** (D-P1-012 host Chromium libs) — review-confirm specs listed only |

---

## Changed-file inventory (M3 RC)

- `packages/diagnostics/src/kpi.ts`
- `packages/diagnostics/src/score.ts`
- `packages/diagnostics/src/quality.ts`
- `packages/diagnostics/src/test-fixtures.ts`
- `packages/diagnostics/src/kpi.test.ts`
- `packages/diagnostics/src/acceptance-audit.test.ts`
- `packages/diagnostics/src/golden-fixture.test.ts` *(new)*
- `docs/DIAGNOSTIC_METHODOLOGY.md`
- `apps/api/src/diagnostics/diagnostics.service.ts`
- `apps/api/src/diagnostics/diagnostics.integration.test.ts`
- `apps/web/src/app/organizations/[orgId]/diagnostics/page.tsx`
- `apps/web/src/app/organizations/[orgId]/diagnostics/[runId]/page.tsx`
- `apps/web/docs/opero-master-completion/M3-FINANCIAL-DIAGNOSTICS-ACCEPTANCE.md`
- `apps/web/docs/opero-master-completion/MASTER-EXECUTION-LEDGER.md`
- `apps/web/docs/opero-master-completion/DEFECT-REGISTER.md`

---

## Deployment dependencies / rollback

| Item | Plan |
|------|------|
| Services | Prefer **API + worker** together (engine package consumed by both); web for READY gate UX + currency omit + missing-input banner |
| Migrations | None |
| Rehearsal | Deploy API→worker→web on `korapay-rehearsal`; run READY synthetic fixture; assert SCORED + metric codes; deny REVIEW_REQUIRED start; no payments/reports |
| Production rollback | Redeploy prior SHAs per service (`API 77ecbf6…` is current prod baseline until this RC promotes) |
| Restrictions | Owner must authorize push/deploy separately |

---

## Remaining risks

1. Turnover still **point-in-time** (AvgAR/AP/Inv not yet available) — disclosed via metric warnings.
2. `score.v1` bands remain provisional heuristics (not industry-calibrated).
3. Some B2.2 cash-flow detail concepts still unused as standalone KPIs (investing/financing/net change in cash, share capital, retained earnings, tax payable) — identity wiring improved for PBT/tax/BS.
4. Playwright E2E still host-blocked.
5. `APP_VERSION` env stamp drift (D-P2-003) unrelated to calc engine version fields.

---

## Defect updates

| ID | Change |
|----|--------|
| D-P0-004 | Partial — ROA/ROE/asset turnover/etc. wired; remaining unused B2.2 concepts noted OPEN |
| D-P1-010 | **FIXED_LOCAL** — READY required to start diagnostics |

---

## Next recommended workstream

**M4 AI interpretation** (local validate + UI grounding) **or** owner-authorized **M3 rehearsal/production API+worker(+web) release** using this RC — then one OWNER diagnostic run on pilot doc `cc04b221-…` (explicitly out of scope here).

---

**STOP FOR OWNER REVIEW.**
