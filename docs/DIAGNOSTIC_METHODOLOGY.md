# Opero X-Ray — Diagnostic methodology (v1)

Version identifiers stored on every run:

| Component | Version id |
| --- | --- |
| Calculation engine | `calc.v1` |
| Score methodology | `score.v1` |
| Findings ruleset | `rules.v1` |

Thresholds and bands below are **provisional heuristics** for transparent internal diagnostics. They are **not** industry benchmarks and are **not** statistically validated. Do not present them as predictive of insolvency, fraud, or guaranteed business outcomes.

## Principles

1. **Deterministic** — same immutable input snapshot always yields the same metrics, quality, score eligibility, and findings.
2. **Missing ≠ zero** — absent amounts are never invented.
3. **No implicit FX** — a run uses one currency; incompatible currencies block affected metrics.
4. **No false proxies** — total liabilities never substitute for interest-bearing debt; total expenses never substitute for COGS.
5. **Coverage ≠ health** — missing data reduces diagnostic coverage; it does not automatically assign a poor (or perfect) financial score.
6. **Review awareness** — `PENDING` / low-quality lines participate with lower reliability than `CONFIRMED` / `CORRECTED`.
7. **Historical reproducibility** — runs store an immutable input snapshot so later document corrections do not rewrite past results.

## Input eligibility

Sources must be organization-owned documents with `deletionStatus=ACTIVE` and `scanStatus=CLEAN`, and extractions that produced financial line items.

Within a run:

- All flow and balance amounts are normalized to **actual units** when `unitScale` is unambiguous (`ACTUAL` ×1, `THOUSANDS` ×1000, `MILLIONS` ×1_000_000). Mixed scales without a single run-level scale → affected metrics `INCOMPATIBLE`.
- Comparable periods are required for period-over-period KPIs (same period length class: annual↔annual, quarterly↔quarterly). Mixing annual with quarterly without explicit comparable ends is rejected for those KPIs.
- Point-in-time balances are never treated as period flows.

## KPI contracts (`calc.v1`)

| Metric code | Formula | Required inputs | Failure modes |
| --- | --- | --- | --- |
| `REVENUE_GROWTH` | `(Rev_t − Rev_{t-1}) / \|Rev_{t-1}\|` | Revenue two comparable periods | Missing prior, zero prior → `UNDEFINED` |
| `GROSS_MARGIN` | `GrossProfit / Revenue` or `(Rev−COGS)/Rev` | Revenue + GP or COGS | Zero/neg revenue → `UNDEFINED` |
| `OPERATING_MARGIN` | `OperatingProfit / Revenue` | Op profit, Revenue | |
| `NET_MARGIN` | `NetProfit / Revenue` | Net profit, Revenue | |
| `OPEX_RATIO` | `OperatingExpenses / Revenue` | Opex, Revenue | |
| `COGS_RATIO` | `COGS / Revenue` | COGS, Revenue | Not total expenses |
| `CURRENT_RATIO` | `CurrentAssets / CurrentLiabilities` | CA, CL | Zero/neg CL → `UNDEFINED` |
| `QUICK_RATIO` | `(CA − Inventory) / CL` | CA, Inventory, CL | Inventory required; no silent omit |
| `CASH_RATIO` | `Cash / CL` | Cash, CL | |
| `WORKING_CAPITAL` | `CA − CL` | CA, CL | Absolute amount |
| `DEBT_TO_EQUITY` | `InterestBearingDebt / Equity` | Debt, Equity | **Not** total liabilities; zero/neg equity → `UNDEFINED` |
| `LIABILITIES_TO_ASSETS` | `TotalLiabilities / TotalAssets` | Totals | |
| `INTEREST_COVERAGE` | `OperatingProfit / InterestExpense` | Op profit, Interest | Zero interest → `UNDEFINED` |
| `RECEIVABLES_TURNOVER` | `Revenue / AvgAR` | Revenue, AR start+end (or flagged single point) | Needs period length for days |
| `DSO` | `DaysInPeriod / ReceivablesTurnover` | Turnover + period days | |
| `INVENTORY_TURNOVER` | `COGS / AvgInventory` | COGS, Inventory averages | |
| `INVENTORY_DAYS` | `DaysInPeriod / InventoryTurnover` | | |
| `PAYABLES_TURNOVER` | `COGS / AvgAP` | COGS, AP averages | |
| `CASH_CONVERSION_CYCLE` | `DSO + InventoryDays − PayablesDays` | All three day metrics | |
| `OCF_MARGIN` | `OCF / Revenue` | OCF, Revenue | |
| `OCF_TO_CURRENT_LIABILITIES` | `OCF / CL` | OCF, CL | |
| `FREE_CASH_FLOW` | `OCF − Capex` | OCF, Capex | Capex required |

Metric statuses: `COMPUTED` | `UNDEFINED` (math invalid) | `INSUFFICIENT_INPUTS` | `INCOMPATIBLE` (currency/period/scale).

Values are decimal **strings** (decimal.js, half-up). Ratios are stored unrounded internally; API display may show limited decimals without claiming false precision in scores.

## Data quality (`calc.v1`)

Four separate measures in `[0, 1]` (stored as decimal strings):

1. **Completeness** — share of required statement types / core concepts present for the requested diagnostic scope.
2. **Consistency** — period alignment, currency agreement, arithmetic reconciliation flags (e.g. GP ≈ Rev−COGS when all three present), duplicate/contradictory concept values.
3. **Evidence reliability** — weighted by review status (`CONFIRMED`/`CORRECTED` high, `PENDING` medium-low, `REJECTED` excluded) and extraction quality.
4. **Diagnostic coverage** — share of score dimensions that have at least one eligible computed metric.

Missing data **reduces coverage**, not health.

## Business Health Score (`score.v1`)

| Dimension | Weight | Example metrics |
| --- | --- | --- |
| Profitability | 25 | Net/op/gross margins; revenue growth when available |
| Liquidity | 20 | Current/quick/cash ratios; working capital sign |
| Leverage | 20 | Liabilities/assets; D/E only if interest-bearing debt present |
| Efficiency | 15 | DSO / CCC when turnover inputs exist |
| Cash flow | 20 | OCF margin; OCF/CL; FCF when OCF+capex exist |

### Eligibility for a numeric overall score

Publish overall **integer 0–100** only if **all** hold:

- `diagnosticCoverage >= 0.60`
- At least **3 of 5** dimensions have ≥1 eligible metric
- Evidence reliability ≥ `0.50`
- Consistency ≥ `0.70` (contradictory figures, multi-currency clashes, or failed reconciliations suppress scoring)

Otherwise overall status is **`INSUFFICIENT_DATA`** (no numeric overall).

Period-over-period KPIs and findings require **comparable period length classes** (annual↔annual, quarterly↔quarterly, monthly↔monthly). Mixing annual with quarterly is `INCOMPATIBLE`, not a silent growth calculation.

The published score is **not** a credit rating, audit opinion, or prediction of business survival.

### Aggregation

- Each included dimension scores integer 0–100 via provisional bands (see engine constants).
- Overall = weighted sum of **included** dimension scores using **original** weights, then scaled by `sum(includedWeights)/100` **without** redistributing missing weight to remaining dimensions. Equivalently: missing dimensions contribute `0` weight to the numerator **and** are disclosed as missing; the displayed overall is `round(sum(componentScore_i * weight_i) / 100)` only when eligibility passes — wait.

Per plan: **do not renormalize** incomplete dimensions in a way that hides gaps. Implementation:

- `raw = sum(componentScore_i * weight_i) / sum(all_five_weights)` where excluded components are omitted from the numerator only, and eligibility already requires coverage ≥ 0.60.
- Missing dimensions are listed explicitly; users see partial weight applied without pretending excluded dimensions scored neutrally at mid-scale.

Actually clearer locked rule:

`overall = round( sum_i (score_i * weight_i) / 100 )` for included dimensions only, **without** boosting weights. Maximum achievable overall when some dimensions are missing is `< 100`, reflecting incomplete coverage. Eligibility still requires coverage ≥ 0.60 so very thin runs never publish.

### Provisional band examples (illustrative)

Exact cut-points live in `@opero/diagnostics` as named constants mirrored here:

- Net margin: &lt;0 → weak; 0–5 → watch; 5–15 → adequate; &gt;15 → strong (provisional).
- Current ratio: &lt;1 → weak; 1–1.5 → watch; 1.5–3 → adequate; &gt;3 → strong (provisional; very high may also flag inefficiency in findings, not score inflation).

## Findings (`rules.v1`)

Deterministic rules (non-exhaustive):

| Rule id | Trigger (summary) | Severity class |
| --- | --- | --- |
| `REV_UP_MARGIN_DOWN` | Revenue up, net margin down vs prior | RISK |
| `OCF_NEG_NI_POS` | OCF &lt; 0 while net income &gt; 0 | RISK |
| `CA_LT_CL` | Current assets &lt; current liabilities | RISK |
| `AR_GROWTH_GT_SALES` | AR growth exceeds revenue growth | OBSERVATION |
| `OPEX_GROWTH_GT_REV` | Opex growth &gt; revenue growth | RISK |
| `PERSISTENT_LOSSES` | Net loss across ≥2 comparable periods | RISK |
| `WEAK_COVERAGE` | Diagnostic coverage below publish threshold | OBSERVATION |

Each finding includes plain-language explanation, business implication, suggested investigation, supporting metric codes, evidence links, confidence/reliability, and review status. Findings never assert proven fraud or insolvency.

## Limitations

- No OCR; image-only PDFs remain manual.
- No generative AI interpretation.
- Period metadata from Phase 4 extractors is often incomplete — runs may stay `INSUFFICIENT_DATA` until periods/currency are confirmed.
- Initial score bands are provisional heuristics.
- Service-layer tenant isolation only (no Postgres RLS).
`}