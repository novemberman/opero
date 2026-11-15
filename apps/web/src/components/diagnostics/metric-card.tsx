"use client";

import {
  formatMetricPeriod,
  formatMetricValue,
  metricStatusLabel,
  metricStatusTone,
  resolveMetricState,
  type MetricInput,
} from "../../lib/diagnostic-metric-presentation";
import { cn } from "../../lib/cn";
import { Badge } from "../ui";

export function MetricCard({ metric }: { metric: MetricInput }) {
  const state = resolveMetricState(metric);
  const period = formatMetricPeriod(metric);
  const available = metric.status === "COMPUTED" && metric.value != null;

  return (
    <li
      className={cn(
        "rounded-2xl border bg-surface p-4 shadow-sm",
        state === "unavailable" ? "border-border" : "border-border",
      )}
      data-testid="metric-card"
      data-metric-code={metric.code}
      data-metric-state={state}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-navy">{metric.label}</p>
          <p className="mt-0.5 font-data text-xs text-text-secondary">{metric.code}</p>
        </div>
        <Badge tone={metricStatusTone(metric.status)}>{metricStatusLabel(metric.status)}</Badge>
      </div>

      <p
        className={cn(
          "mt-4 font-data text-2xl font-semibold",
          available ? "text-navy" : "text-text-secondary",
        )}
      >
        {available ? formatMetricValue(metric.value, metric.unit) : "Unavailable"}
      </p>

      <dl className="mt-3 grid gap-2 text-xs text-text-secondary sm:grid-cols-2">
        <div>
          <dt className="font-semibold uppercase tracking-[0.12em]">Unit</dt>
          <dd className="mt-0.5 font-data text-navy">{metric.unit ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-[0.12em]">Period</dt>
          <dd className="mt-0.5 font-data text-navy">{period ?? "Not provided"}</dd>
        </div>
      </dl>

      {(metric.formulaId || (metric.inputRefs && metric.inputRefs.length > 0) || (metric.warnings && metric.warnings.length > 0)) ? (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-semibold text-navy">
            Calculation & evidence
          </summary>
          <div className="mt-2 space-y-1 text-text-secondary">
            {metric.formulaId ? <p>Formula: {metric.formulaId}</p> : null}
            {metric.inputRefs && metric.inputRefs.length > 0 ? (
              <p>Input refs: {metric.inputRefs.join(", ")}</p>
            ) : (
              <p>No input snapshot refs returned for this metric.</p>
            )}
            {(metric.warnings ?? []).map((warning) => (
              <p key={warning} className="text-warning">
                {warning}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </li>
  );
}
