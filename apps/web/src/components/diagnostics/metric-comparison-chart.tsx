"use client";

import {
  formatMetricValue,
  type MetricInput,
} from "../../lib/diagnostic-metric-presentation";
import { cn } from "../../lib/cn";

/**
 * Horizontal comparison of computed ratio/percent metrics in a dimension.
 * Skips non-numeric or unavailable values — never invents a series.
 */
export function MetricComparisonChart({
  metrics,
  className,
}: {
  metrics: MetricInput[];
  className?: string;
}) {
  const computed = metrics
    .filter((m) => m.status === "COMPUTED" && m.value != null)
    .map((m) => {
      const numeric = Number(m.value);
      return Number.isFinite(numeric) ? { metric: m, numeric: Math.abs(numeric) } : null;
    })
    .filter((row): row is { metric: MetricInput; numeric: number } => row != null);

  if (computed.length < 2) return null;

  const max = Math.max(...computed.map((row) => row.numeric), 0.0001);

  return (
    <div
      className={cn("rounded-2xl border border-border bg-workspace p-4", className)}
      data-testid="metric-comparison-chart"
      role="img"
      aria-label="Comparison of computed metrics in this category"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary">
        Computed measures (absolute scale for comparison)
      </p>
      <ul className="mt-3 space-y-2.5">
        {computed.map(({ metric, numeric }) => (
          <li key={metric.code}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-medium text-navy">{metric.label}</span>
              <span className="shrink-0 font-data text-text-secondary">
                {formatMetricValue(metric.value, metric.unit)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-navy/70"
                style={{ width: `${Math.min(100, (numeric / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
