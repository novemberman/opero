"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_EXTRACTION_REVIEW_FILTER,
  EXTRACTION_REVIEW_FILTER_LABELS,
  EXTRACTION_REVIEW_FILTERS,
  filterCount,
  selectExtractionReviewLines,
  summarizeExtractionReview,
  type ExtractionReviewFilterId,
} from "../lib/extraction-review-presentation";
import { cn } from "../lib/cn";
import { Alert, EmptyState, buttonClassName } from "./ui";
import {
  ExtractionLineCard,
  type ExtractionLine,
  type ExtractionReviewSubmitInput,
} from "./extraction-line-card";

function SummaryStat({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: "warning" | "emerald" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm",
        emphasize === "warning" && value > 0 ? "border-warning/40" : null,
        emphasize === "emerald" && value > 0 ? "border-emerald/30" : null,
      )}
      data-testid="extraction-review-stat"
      data-stat-label={label}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-data text-2xl font-semibold",
          emphasize === "warning" && value > 0 ? "text-warning" : "text-navy",
          emphasize === "emerald" && value > 0 ? "text-emerald" : null,
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ExtractionReviewBoard({
  lines,
  canWrite,
  submittingLineId,
  onSubmitReview,
  heading = "Extracted figures",
  description,
  preferredFilter,
}: {
  lines: ExtractionLine[];
  canWrite: boolean;
  submittingLineId?: string | null;
  onSubmitReview: (input: ExtractionReviewSubmitInput) => void | Promise<void>;
  heading?: string;
  description?: string;
  /** After a successful confirm, parent may steer the inventory to All/Confirmed. */
  preferredFilter?: ExtractionReviewFilterId | null;
}) {
  const [filter, setFilter] = useState<ExtractionReviewFilterId>(DEFAULT_EXTRACTION_REVIEW_FILTER);

  useEffect(() => {
    if (!preferredFilter) return;
    setFilter(preferredFilter);
  }, [preferredFilter]);

  const summary = useMemo(() => summarizeExtractionReview(lines), [lines]);
  const visibleLines = useMemo(
    () => selectExtractionReviewLines(lines, filter),
    [lines, filter],
  );

  const reviewComplete =
    lines.length > 0 && summary.pendingAll === 0;
  const monetaryPendingRemain = summary.pendingMonetary > 0;

  return (
    <section aria-labelledby="extracted-figures" data-testid="extraction-review-board">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="extracted-figures" className="text-lg font-semibold text-navy">
            {heading}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            {description ??
              "All extracted figures stay in the inventory after confirmation. Use Pending review for the monetary queue and Confirmed to inspect settled figures — filtering never deletes records."}
          </p>
        </div>
        {lines.length > 0 ? (
          <p className="text-sm text-text-secondary" data-testid="extraction-review-totals">
            {summary.total} extracted · {summary.confirmed} confirmed · {summary.rejected} rejected ·{" "}
            {summary.pendingAll} pending
            {reviewComplete ? " · all line statuses settled" : ""}
          </p>
        ) : null}
      </div>

      {lines.length > 0 ? (
        <div className="mt-4" data-testid="extraction-review-summary">
          <p className="brand-kicker">Review summary</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryStat
              label="Pending monetary"
              value={summary.pendingMonetary}
              emphasize="warning"
            />
            <SummaryStat label="Mapped monetary" value={summary.mappedMonetary} />
            <SummaryStat
              label="Unmapped monetary"
              value={summary.unmappedMonetary}
              emphasize="warning"
            />
            <SummaryStat
              label="Scale confirmation"
              value={summary.scaleConfirmationRequired}
              emphasize="warning"
            />
            <SummaryStat
              label="Scale confidence (info)"
              value={summary.scaleConfidenceAttention}
              emphasize="neutral"
            />
            <SummaryStat label="Contextual / non-monetary" value={summary.contextualNonMonetary} />
            <SummaryStat label="Confirmed" value={summary.confirmed} emphasize="emerald" />
            <SummaryStat label="Rejected" value={summary.rejected} />
            <SummaryStat label="All extracted" value={summary.total} emphasize="neutral" />
          </div>
          <p className="mt-3 text-xs text-text-secondary">
            Counts are derived from extraction fields already returned by the API (
            <span className="font-data">quantityClass</span>, concept, review status, scale flags,
            scale confidence). Missing <span className="font-data">quantityClass</span> is treated
            as monetary. <span className="font-data">Scale confirmation</span> counts only{" "}
            <span className="font-data">unitScaleRequiresReview</span>;{" "}
            <span className="font-data">Scale confidence (info)</span> is informational and does not
            create a mandatory review flag. Document{" "}
            <span className="font-data">REVIEW_REQUIRED</span> is unchanged by these filters.
          </p>
        </div>
      ) : null}

      {lines.length > 0 && monetaryPendingRemain ? (
        <div className="mt-4">
          <Alert tone="warning" title="Monetary figures need human confirmation">
            {summary.pendingMonetary} monetary figure
            {summary.pendingMonetary === 1 ? "" : "s"} still pending. Confirm, correct or reject
            each item. Confirmed figures remain listed under All figures and Confirmed. Diagnostics
            should use only eligible confirmed monetary inputs.
          </Alert>
        </div>
      ) : null}

      {lines.length > 0 && !monetaryPendingRemain && summary.pendingAll > 0 ? (
        <div className="mt-4">
          <Alert tone="info" title="No pending monetary figures in this queue">
            Remaining pending items are contextual or already outside the Pending review filter.
            Open Contextual / non-diagnostic or All figures to inspect them — statuses are
            unchanged.
          </Alert>
        </div>
      ) : null}

      {lines.length > 0 && reviewComplete ? (
        <div className="mt-4">
          <Alert tone="success" title="Review complete for extracted lines">
            All current line items are confirmed or rejected and remain in the inventory.
          </Alert>
        </div>
      ) : null}

      {lines.length > 0 ? (
        <div className="mt-6" data-testid="extraction-review-filters">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Filters
          </p>
          <div
            role="tablist"
            aria-label="Extraction review filters"
            className="mt-2 flex flex-wrap gap-2"
          >
            {EXTRACTION_REVIEW_FILTERS.map((id) => {
              const selected = filter === id;
              const count = filterCount(lines, id);
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  data-filter={id}
                  data-testid={`extraction-filter-${id}`}
                  className={buttonClassName({
                    variant: selected ? "primary" : "secondary",
                    size: "sm",
                    className: cn(
                      "rounded-full",
                      selected ? "" : "border-border text-navy",
                    ),
                  })}
                  onClick={() => setFilter(id)}
                >
                  {EXTRACTION_REVIEW_FILTER_LABELS[id]}
                  <span className="font-data opacity-80">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <ul className="mt-4 space-y-4" data-testid="extraction-review-list">
        {visibleLines.map((row) => (
          <ExtractionLineCard
            key={row.id}
            line={row}
            canWrite={canWrite}
            submitting={submittingLineId === row.id}
            onSubmitReview={onSubmitReview}
          />
        ))}
      </ul>

      {lines.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No extracted figures yet"
            description="Processing may still be running. The timeline above updates as stages complete."
          />
        </div>
      ) : null}

      {lines.length > 0 && visibleLines.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No items in this filter"
            description="Try All figures or Confirmed. Hidden records keep their review status — filtering does not confirm, reject or delete extractions."
            action={
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClassName({ variant: "secondary", size: "sm" })}
                  onClick={() => setFilter("all")}
                >
                  Show all figures
                </button>
                <button
                  type="button"
                  className={buttonClassName({ variant: "secondary", size: "sm" })}
                  onClick={() => setFilter("confirmed")}
                >
                  Show confirmed
                </button>
              </div>
            }
          />
        </div>
      ) : null}
    </section>
  );
}
