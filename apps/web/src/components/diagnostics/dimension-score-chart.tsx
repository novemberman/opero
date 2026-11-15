"use client";

import { dimensionLabel } from "../../lib/diagnostic-dimensions";
import type { ScoreComponentInput } from "../../lib/health-score-presentation";
import { cn } from "../../lib/cn";

/**
 * CSS bar chart of backend category scores. Never invents values —
 * excluded / null scores render as empty tracks.
 */
export function DimensionScoreChart({
  components,
  className,
}: {
  components: ScoreComponentInput[];
  className?: string;
}) {
  return (
    <div
      className={cn("space-y-3", className)}
      data-testid="dimension-score-chart"
      role="img"
      aria-label="Category score breakdown from backend components"
    >
      {components.map((component) => {
        const value =
          component.included && component.score != null && Number.isFinite(Number(component.score))
            ? Math.min(100, Math.max(0, Number(component.score)))
            : null;
        return (
          <div key={component.dimension}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-navy">{dimensionLabel(component.dimension)}</span>
              <span className="font-data text-text-secondary">
                {value != null ? value : "n/a"}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-border">
              {value != null ? (
                <div
                  className="h-full rounded-full bg-emerald transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${value}%` }}
                />
              ) : (
                <div className="h-full w-full rounded-full bg-border" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
