# Phase 9 — Visual identity alignment

## Audit summary

Tokens in `globals.css` already matched the approved palette. The teal-dominant feel came from **usage**: emerald kickers, ice+emerald active nav, emerald score figures, and strong emerald hero glows.

## Semantic roles applied

| Colour | Role |
|--------|------|
| Navy | Shell, titles, structure, score figures |
| Emerald | Primary actions, progress bars, focus |
| Gold | Premium kickers / selected nav accent |
| Workspace / white | Canvas + content surfaces |
| Slate | Secondary text / metadata |
| Ice | Calm info surfaces only |

## Surfaces updated

- Workspace sidebar → navy structure + gold selection cue
- Landing / auth heroes → navy with restrained gold/ice atmosphere (less emerald wash)
- Documents, dashboard, diagnostics/readiness/AI kickers → `.brand-kicker`
- Design-system specimen shows roles **in components**, not only swatches

## Boundaries respected

No backend, auth, CSRF, formulas, or schema changes. Warning/success status colours unchanged; gold does not replace warning.
