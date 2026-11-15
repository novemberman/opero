# Phase 9D — Premium documents & financial extraction

## Changes

- Collapsed workspace sidebar: icons (`nav-icons.tsx`) + tooltips + `aria-label` / sr-only text (replaces first-letter labels). Routes and permission gating unchanged.
- Document library: filename, format, processing/scan/extraction status, upload time, Open/Review actions; client-side search + status/format filters derived from loaded rows; desktop table + mobile cards; loading / empty / error.
- Status codes render as readable labels (`document-status-labels.ts`); underlying values remain on `data-status` / `title` and in filter option values. Mobile badges truncate to avoid overflow.
- Empty library offers **Upload document** (focuses the upload panel). Recoverable list errors offer **Retry**.
- Upload: drag-and-drop hierarchy + file picker; selected filename / size / format summary; 20MB / PDF·XLSX·CSV hard validation; XHR upload progress; success/error alerts; **advisory** duplicate-filename warnings (does not block). Backend content-hash duplicate detection unchanged. Fixture-only duplicate toggle stays on `/design-system/documents`.
- Processing timeline: renders `DocumentProcessingProgress` from `@opero/shared`. Numeric percent only when `progressPercent` is non-null; otherwise stage-based indeterminate progress. Completed / running / pending / skipped / failed preserved.
- Extraction review: `resolveMonetaryPresentation` distinguishes **confirmed**, **provisional**, **undetermined**, and **non-monetary** amounts using mapping, scale-review and review-status contracts — never high extraction confidence alone. Raw / statement units / scale / evidence preserved. Provisional candidates are labelled and not treated as established NGN figures.
- Document detail: prioritized lines, pending/confirmed counts, explicit “human confirmation required” / “review complete” banners. Review POST payload unchanged.

## Screenshots

| File | Subject |
|------|---------|
| `library-desktop-1440.png` | Document library fixture (desktop) |
| `library-mobile-375.png` | Document library fixture (mobile) |
| `upload-1440.png` | Upload interface |
| `timeline-1440.png` | Active processing timeline |
| `extraction-review-1440.png` | Confirmed / provisional / non-monetary / undetermined review |
| `scale-warning-1440.png` | Ambiguous scale provisional warning |
| `empty-1440.png` | Empty state with Upload action |
| `error-1440.png` | Error state with Retry |

Fixture UI: `/design-system/documents` (explicitly labelled sample data).

## Known limitations

- Document **list** API does not return reporting period labels; periods appear on document detail via statement metadata after extraction.
- Duplicate **filename** checks are advisory only; authoritative duplicate-**content** detection remains on the server.
- Upload progress measures XHR byte transfer only; scan/extract progress uses the processing timeline, not a fake percentage.
- Stage labels come from shared `PROCESSING_STAGE_LABELS` (slightly longer than the brief’s shorthand).
- Authenticated live-data screenshots require a signed-in session; 9D visual evidence uses labelled fixtures.
- Review actions remain permission-gated (`xray:write`); viewers see cards without edit forms.
