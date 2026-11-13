# Phase 6 — Readiness, AI interpretation, and professional reports

## Scope

Phase 6 adds diagnostic readiness checks, evidence reconciliation, optional AI narrative drafts, and private PDF X-Ray reports. Authoritative KPIs, scores, and findings remain exclusively in `@opero/diagnostics`. AI never alters calculated metrics.

## Permissions

| Permission | Roles | Use |
| --- | --- | --- |
| `xray:read` | OWNER, ADMIN, ANALYST, VIEWER | Read readiness, AI drafts, reports; download PDF |
| `xray:write` | OWNER, ADMIN, ANALYST | Metadata edits, readiness assess, reconcile, generate AI, create/submit reports |
| `xray:publish` | OWNER, ADMIN | Approve / publish / reject reports |

VIEWER remains read/download only.

## Prompt versions

| Version | Package | Notes |
| --- | --- | --- |
| `ai.interpret.v1` | `@opero/ai` | Structured facts only inside `<diagnostic_facts>`; user/extracted text treated as untrusted data |

## Data sharing

- Default: `AI_SHARE_STRUCTURED_CONTEXT=true` sends metrics, findings, quality, score, and limitations only.
- Raw document bytes are **never** sent by default.
- When `AI_SHARE_STRUCTURED_CONTEXT=false`, interpretation generation is refused.
- `AI_PROVIDER=mock` (default/tests) produces labeled simulated output — never present as live AI.
- `AI_PROVIDER=openai` requires `OPENAI_API_KEY` and `OPENAI_MODEL`. Automated tests never call the network.

## Claim grounding

AI claims must cite allowed metric codes and/or finding ids. Unsupported claims are stored separately and must not be treated as verified diagnostic facts. The PDF tables from the diagnostic snapshot take precedence over narrative prose.

Every generated narrative passes through `checkNarrativeGrounding` (`@opero/ai`) before it is stored. A statement is flagged, with a reason, when:

| Reason | Meaning |
| --- | --- |
| `NO_REFERENCES` / `UNKNOWN_METRIC_CODE` / `UNKNOWN_FINDING_ID` | A claim cites nothing, or cites a metric or finding that is not part of the run |
| `UNSUPPORTED_NUMBER` | The text quotes a figure that is not in the facts it may rest on: the metrics and findings a claim cites, plus the score and data quality. Recomputed percentages, invented amounts, forecasts and a value of a metric the claim does not cite are all flagged. A computed value may be rounded to one or more decimals |
| `CONTRADICTORY_NUMBER` | Added next to `UNSUPPORTED_NUMBER` when the claim's references all resolve and include a computed metric: the claim cites the diagnostic and still quotes a figure that is not in it |
| `RESTRICTED_LANGUAGE` | The text uses audit, credit-rating, insolvency, going-concern, certification, guarantee or fraud wording. Text copied word for word from a supplied finding or limitation is exempt |

The figure and wording checks also cover the prose a reader sees (`summary`, `keyObservations`, `risks`, `limitations`); flagged prose is stored in `unsupportedClaims` with its `section`. Nothing is removed from the narrative: flags are shown to reviewers, and a report that attaches the narrative discloses how many statements were flagged. Figures in user notes never count as facts.

The figure check is lexical. It shows that a quoted figure exists among the permitted facts, not that the sentence uses it correctly; a wrong sign, or a small number that happens to equal another permitted fact, is not detected.

### Phase 6B: critical grounding blocks approval and publication

Each flag gets a severity (`classifyGroundingResult`, validation version `grounding.v2`). These are `CRITICAL`:

- `UNSUPPORTED_NUMBER` and `CONTRADICTORY_NUMBER`
- `RESTRICTED_LANGUAGE`
- a claim that quotes a figure but has no valid reference (`NO_REFERENCES`, `UNKNOWN_METRIC_CODE`, `UNKNOWN_FINDING_ID`)

A reference failure on a claim that quotes no figure is `HIGH` or `MEDIUM` and does not block.

A report version that carries an AI narrative is validated again, from the narrative and the metrics and findings frozen in that version, at **approve** and at **publish**. Any critical flag returns `409 CRITICAL_GROUNDING_VIOLATIONS` with the violations in `groundingValidation`. A reviewer cannot override this: the request body carries no override, a stored validation record is not trusted, and publication repeats the check, so neither an approval written around the gate nor text changed after approval gets through. A passed validation is stored on the version (`disclosures.groundingValidation`) and audited as `report.grounding_validated`. Reports without an AI narrative are unaffected.

A draft with a flagged narrative can still be created and submitted. To get it published, either detach the interpretation, attach a regenerated one, or correct it:

- `POST …/ai/interpretations/:runId/versions/:versionId/edit` no longer changes the version it is called on. It stores a **new** interpretation version with the corrected text, runs grounding on it again, and audits `ai.interpretation_corrected` (prior version, edited fields, critical count). Claims are carried over unchanged, so a critical flag on a claim needs a regenerated interpretation rather than a correction.
- A report version keeps the interpretation version it was created with. Attach the correction by creating a new report version with its `aiInterpretationVersionId` (reject the report first if it is in review), then submit and approve again.

## Report lifecycle

`DRAFT` → `REVIEW_REQUIRED` → `APPROVED` → `PUBLISHED` (immutable PDF)

Also: `REJECTED`, `SUPERSEDED`.

### Publish gates

- The current version is `APPROVED` and carries its own recorded `APPROVE` decision (no `REJECT`); otherwise `409 APPROVAL_NOT_RECORDED`
- Diagnostic run `SUCCEEDED`
- Readiness status is not `BLOCKED`
- No unresolved **critical** evidence reconciliations
- An attached AI narrative has no critical grounding flag; otherwise `409 CRITICAL_GROUNDING_VIOLATIONS` (see Phase 6B above)
- If score is `INSUFFICIENT_DATA`: publish allowed only as **non-verified / limitations-forward** (`verifiedPublication=false`)
- Fully verified publication requires a `SCORED` run that passes the gates above

PDFs are rendered with `pdfkit` via `@opero/reports` and stored at:

`org/{orgId}/reports/{reportId}/{versionId}.pdf`

### Phase 6B: published PDFs are immutable

- The PDF is rendered once, at publication, and written with `overwrite: false`. If an object already exists at the version's key, publication fails with `409 PUBLISHED_ARTIFACT_EXISTS` and is rolled back. Concurrent publishers are serialized on the report row, so one publishes and the others get `409`.
- A database trigger (`xray_report_versions_immutable_artifacts`, migration `20261113140000_phase6b_publication_integrity`) rejects any change to `storage_key`, `content_hash`, `byte_size` or `snapshot_payload` of a `PUBLISHED` or `SUPERSEDED` version that has a content hash.
- Download verifies the stored bytes against the recorded SHA-256 and fails closed: `409 PUBLISHED_PDF_MISSING` when the object is gone, `409 PUBLISHED_PDF_CORRUPT` when the hash differs. Both are audited as `report.pdf_integrity_failed` (`reason` `MISSING_OBJECT` or `HASH_MISMATCH`, expected and actual hash) and are not recorded as downloads.
- Nothing regenerates a published PDF. `POST …/versions/:versionId/render` always returns `409 PUBLISHED_PDF_IMMUTABLE` for a published version (audited as `report.pdf_regenerate_rejected`), and the worker's render job only verifies the object (`SKIPPED` or `INTEGRITY_FAILURE`).
- To replace a lost or damaged PDF, or to change anything else, create a new report version and publish it. The earlier version becomes `SUPERSEDED` and keeps its own record.

## Rate limits

Costly endpoints are throttled at 10 requests / 60s (in addition to the global API throttler):

- `POST …/ai/interpretations`
- `POST …/reports/:id/publish`
- `POST …/reports/:id/versions/:versionId/render`

## Limitations

- Mock AI is deterministic scaffolding, not a model.
- Live AI may invent prose. Grounding flags unsupported references, figures and restricted wording; it does not judge qualitative statements that quote no figure. Critical flags block approval and publication; lower-severity flags (for example a claim without references that quotes no figure) are disclosed as a count and can still be published after review.
- Phase 5 score gates (`coverage` / `reliability` / `consistency`) are unchanged.
- No public share links, billing, or Railway in this phase.
