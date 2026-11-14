# Phase 9D — Premium documents & financial extraction

## Changes

- Collapsed workspace sidebar: icons (`nav-icons.tsx`) + tooltips + `aria-label` / sr-only text (replaces first-letter labels). Routes and permission gating unchanged.
- Document library: filename, format, processing/scan/extraction status, upload time, Open/Review actions; client-side search + status/format filters derived from loaded rows; desktop table + mobile cards; loading / empty / error.
- Upload: drag-and-drop + file picker; 20MB / PDF·XLSX·CSV guidance matching backend; XHR upload progress; success/error alerts; soft duplicate filename check against existing library names.
- Processing timeline: renders `DocumentProcessingProgress` from `@opero/shared` (stage statuses from backend mapping). Indeterminate bar when `progressPercent` is null.
- Extraction review: `ExtractionLineCard` shows concept, raw value, statement units, scale + confidence, actual monetary amount only for monetary lines, evidence snippet/page, scale/unmapped/non-monetary warnings, review form when `xray:write`.
- Document detail: prioritized lines, pending/confirmed counts, explicit “human confirmation required” / “review complete” banners. Review POST payload unchanged.

## Screenshots

| File | Subject |
|------|---------|
| `library-desktop-1440.png` | Document library fixture (desktop) |
| `library-mobile-375.png` | Document library fixture (mobile) |
| `upload-1440.png` | Upload interface |
| `timeline-1440.png` | Active processing timeline |
| `extraction-review-1440.png` | Mixed mapped / unmapped / non-monetary review |
| `scale-warning-1440.png` | Scale confirmation warning (cropped card) |
| `empty-1440.png` | Empty state |
| `error-1440.png` | Error state |

Fixture UI: `/design-system/documents` (explicitly labelled sample data).

## Known limitations

- Document **list** API does not return reporting period labels; periods appear on document detail via statement metadata after extraction.
- Duplicate detection is **client-side by filename** only; server may still accept same content under a different name (no content-hash API).
- Upload progress measures XHR byte transfer only; scan/extract progress uses the processing timeline, not a fake percentage.
- Stage labels come from shared `PROCESSING_STAGE_LABELS` (slightly longer than the brief’s shorthand).
- Authenticated live-data screenshots require a signed-in session; 9D visual evidence uses labelled fixtures.
- Review actions remain permission-gated (`xray:write`); viewers see cards without edit forms.
