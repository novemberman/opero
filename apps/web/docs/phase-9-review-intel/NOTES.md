# Extraction review intelligence — Stage A

**Scope:** Frontend-only review summary, filters and monetary-first prioritization.  
**Boundaries:** No migrations, backend, extraction algorithm, formula, auth or tenant changes.

## Behaviour

- Default filter: **Needs financial review** (pending `MONETARY` lines; missing `quantityClass` treated as monetary).
- Summary counts derived client-side from existing extraction API fields.
- Contextual DATE / PERCENTAGE / RATIO / NOTE_NUMBER / OTHER remain under **Contextual / non-diagnostic**.
- Filters never confirm, reject, dismiss or delete records and do not change document `REVIEW_REQUIRED`.

## API limitation

If `quantityClass` is omitted, the line is counted as monetary (matches pre-Phase-8 defaults). The UI documents this under the review summary; values are not fabricated beyond that rule.

## Validation

- Vitest + typecheck: pass on host
- Docker production image `opero-web:review-intel-a` (`deploy/docker/Dockerfile.web`): pass
- Host `pnpm --filter @opero/web build`: currently fails prerendering `/_global-error` (`useContext` null) — reproduced with Stage A stashed; not introduced by this change. Railway uses the Dockerfile path.

## Screenshots

- `review-summary-filters-1440.png` — desktop summary + default monetary queue
- `review-summary-filters-375.png` — mobile
- `contextual-filter-1440.png` — contextual / non-diagnostic filter
- `contextual-filter-375.png` — mobile contextual
