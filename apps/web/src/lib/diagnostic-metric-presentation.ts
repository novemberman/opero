import { dimensionLabel, sortDimensions } from "./diagnostic-dimensions";

export type MetricInput = {
  code: string;
  label: string;
  dimension: string;
  status: string;
  value: string | null;
  unit: string | null;
  formulaId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  periodLabel?: string | null;
  inputRefs?: string[] | null;
  warnings?: string[] | null;
};

export type MetricPresentationState = "favorable" | "unfavorable" | "neutral" | "unavailable";

/**
 * Format a metric value with its unit for display.
 * Does not reinterpret ratios or invent units.
 */
export function formatMetricValue(value: string | null, unit: string | null | undefined): string {
  if (value == null || value === "") return "—";
  if (!unit || unit === "ratio") return value;
  if (unit === "percent" || unit === "%") return `${value}%`;
  return `${value} ${unit}`;
}

export function metricStatusLabel(status: string): string {
  switch (status) {
    case "COMPUTED":
      return "Computed";
    case "UNDEFINED":
      return "Undefined";
    case "INSUFFICIENT_INPUTS":
      return "Insufficient inputs";
    case "INCOMPATIBLE":
      return "Incompatible";
    default:
      return status;
  }
}

export function metricStatusTone(
  status: string,
): "success" | "warning" | "error" | "neutral" | "info" {
  if (status === "COMPUTED") return "success";
  if (status === "INSUFFICIENT_INPUTS") return "warning";
  if (status === "INCOMPATIBLE" || status === "UNDEFINED") return "neutral";
  return "neutral";
}

/**
 * Favorable / unfavorable is only labelled when the backend finding or
 * metric warnings already imply direction — we do not invent thresholds.
 * Without directional signal, computed metrics stay neutral.
 */
export function resolveMetricState(metric: MetricInput): MetricPresentationState {
  if (metric.status !== "COMPUTED" || metric.value == null) return "unavailable";
  const warnings = metric.warnings ?? [];
  const joined = warnings.join(" ").toLowerCase();
  if (joined.includes("unfavorable") || joined.includes("adverse")) return "unfavorable";
  if (joined.includes("favorable") || joined.includes("positive signal")) return "favorable";
  return "neutral";
}

export function formatMetricPeriod(metric: MetricInput): string | null {
  if (metric.periodLabel) return metric.periodLabel;
  if (metric.periodStart && metric.periodEnd) {
    return `${metric.periodStart} → ${metric.periodEnd}`;
  }
  if (metric.periodStart || metric.periodEnd) {
    return metric.periodStart ?? metric.periodEnd ?? null;
  }
  return null;
}

export function groupMetricsByDimension(metrics: MetricInput[]): Array<{
  dimension: string;
  label: string;
  metrics: MetricInput[];
  computedCount: number;
  unavailableCount: number;
}> {
  const map = new Map<string, MetricInput[]>();
  for (const metric of metrics) {
    const list = map.get(metric.dimension) ?? [];
    list.push(metric);
    map.set(metric.dimension, list);
  }
  return sortDimensions([...map.keys()]).map((dimension) => {
    const list = map.get(dimension) ?? [];
    return {
      dimension,
      label: dimensionLabel(dimension),
      metrics: list,
      computedCount: list.filter((m) => m.status === "COMPUTED").length,
      unavailableCount: list.filter((m) => m.status !== "COMPUTED").length,
    };
  });
}

/**
 * Comparative periods are only available when distinct period labels exist
 * across computed metrics. Returns null when a trend chart would invent data.
 */
export function distinctComputedPeriods(metrics: MetricInput[]): string[] {
  const set = new Set<string>();
  for (const metric of metrics) {
    if (metric.status !== "COMPUTED") continue;
    const period = formatMetricPeriod(metric);
    if (period) set.add(period);
  }
  return [...set];
}
