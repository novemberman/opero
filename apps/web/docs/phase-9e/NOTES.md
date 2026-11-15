# Phase 9E — Premium diagnostics, readiness & AI interpretation

## Changes

- Diagnostics list/detail redesigned with Phase 9A UI primitives and Phase 9C workspace shell.
- `HealthScorePanel` presents Business Health Score only when backend status is `SCORED`; withheld / pending / unavailable states are explicit.
- Category breakdown uses backend component scores/weights; CSS bar chart never invents values.
- Metrics grouped by profitability / liquidity / leverage / efficiency / cash flow with units, periods, formula ids and input refs in expandable evidence.
- Comparative period trends withheld unless distinct period labels exist on computed metrics.
- Findings show expandable source evidence (snapshot keys, document links, supporting metrics).
- Readiness workspace: status panel, checklist, issues with links to document review / reconciliations; outcomes documented from API statuses only.
- AI list/detail: availability banner, simulated labelling, narrative vs grounding vs human-edit separation.
- Design-system specimens at `/design-system/diagnostics` (labelled fixtures).

## Screenshots

| File | Subject |
|------|---------|
| `diagnostics-overview-1440.png` / `diagnostics-overview-375.png` | Diagnostics overview |
| `health-score-1440.png` / `health-score-375.png` | Business Health Score (eligible) |
| `withheld-score-1440.png` / `withheld-score-375.png` | Withheld / insufficient-data score |
| `readiness-1440.png` / `readiness-375.png` | Readiness assessment |
| `ai-interpretation-1440.png` / `ai-interpretation-375.png` | AI interpretation |
| `evidence-detail-1440.png` / `evidence-detail-375.png` | Finding evidence detail |
| `loading-1440.png` | Loading skeletons |
| `error-1440.png` | Error + empty states |

Fixture UI: `/design-system/diagnostics` (explicitly labelled sample data).

## Known limitations

- No multi-period revenue/profitability time-series chart unless the metrics API returns multiple period labels — intentionally withheld rather than fabricated.
- Snapshot line amounts are not drillable beyond `inputRefs` / evidence document links (no line-payload endpoint on the run detail API).
- Favorable/unfavorable metric colouring only applies when metric warnings already contain directional language; otherwise computed metrics stay neutral.
- Live authenticated screenshots require a signed-in session; 9E visual evidence uses labelled fixtures.
