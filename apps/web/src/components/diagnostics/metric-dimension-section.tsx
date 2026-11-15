"use client";

import { dimensionBlurb } from "../../lib/diagnostic-dimensions";
import {
  groupMetricsByDimension,
  type MetricInput,
} from "../../lib/diagnostic-metric-presentation";
import { MetricCard } from "./metric-card";
import { MetricComparisonChart } from "./metric-comparison-chart";
import { EmptyState } from "../ui";

export function MetricDimensionSections({ metrics }: { metrics: MetricInput[] }) {
  const groups = groupMetricsByDimension(metrics);

  if (groups.length === 0) {
    return (
      <EmptyState
        title="No metrics yet"
        description="Computed and unavailable measures appear here when the diagnostic run finishes."
      />
    );
  }

  return (
    <div className="space-y-10" data-testid="metric-dimension-sections">
      {groups.map((group) => (
        <section key={group.dimension} aria-labelledby={`dim-${group.dimension}`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 id={`dim-${group.dimension}`} className="text-lg font-semibold text-navy">
                {group.label}
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-text-secondary">
                {dimensionBlurb(group.dimension)}
              </p>
            </div>
            <p className="text-sm text-text-secondary">
              {group.computedCount} computed · {group.unavailableCount} unavailable
            </p>
          </div>

          <MetricComparisonChart metrics={group.metrics} className="mt-4" />

          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {group.metrics.map((metric) => (
              <MetricCard key={metric.code} metric={metric} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
