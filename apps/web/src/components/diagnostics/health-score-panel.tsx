"use client";

import { dimensionLabel } from "../../lib/diagnostic-dimensions";
import {
  resolveHealthScorePresentation,
  type ScoreInput,
} from "../../lib/health-score-presentation";
import { cn } from "../../lib/cn";
import { Alert, Badge, Card, CardHeader } from "../ui";
import { DimensionScoreChart } from "./dimension-score-chart";

export function HealthScorePanel({
  runStatus,
  score,
  quality,
  className,
}: {
  runStatus: string | null | undefined;
  score: ScoreInput | null | undefined;
  quality?: {
    completeness: string;
    consistency: string;
    evidenceReliability: string;
    diagnosticCoverage: string;
    details?: { missingDimensions?: string[] };
  } | null;
  className?: string;
}) {
  const presentation = resolveHealthScorePresentation({ runStatus, score });

  return (
    <Card className={cn(className)} data-testid="health-score-panel" data-score-kind={presentation.kind}>
      <CardHeader
        title={presentation.headline}
        description={presentation.explanation}
        action={<Badge tone={presentation.badgeTone}>{presentation.badgeLabel}</Badge>}
      />

      <div className="mt-6 flex flex-wrap items-end gap-8">
        {presentation.kind === "scored" && presentation.scoreText != null ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
              Overall score
            </p>
            <p className="mt-1 font-data text-5xl font-semibold text-emerald sm:text-6xl">
              {presentation.scoreText}
            </p>
          </div>
        ) : (
          <div className="max-w-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
              Overall score
            </p>
            <p className="mt-2 text-2xl font-semibold text-text-secondary">
              {presentation.kind === "withheld"
                ? "Withheld"
                : presentation.kind === "pending"
                  ? "Pending"
                  : "Unavailable"}
            </p>
          </div>
        )}

        {quality ? (
          <dl className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Completeness", quality.completeness],
                ["Consistency", quality.consistency],
                ["Reliability", quality.evidenceReliability],
                ["Coverage", quality.diagnosticCoverage],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
                  {label}
                </dt>
                <dd className="mt-1 font-data text-sm text-navy">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      {presentation.kind === "withheld" ? (
        <div className="mt-5">
          <Alert tone="warning" title="Score withheld by eligibility rules">
            Underlying category components may still appear below for transparency. No substitute
            score is calculated in the browser.
          </Alert>
        </div>
      ) : null}

      {score?.components && score.components.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-navy">Diagnostic categories</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Category scores and weights come from the backend methodology. Excluded dimensions show
            the reported reason.
          </p>
          <DimensionScoreChart components={score.components} className="mt-4" />
          <ul className="mt-4 space-y-2">
            {score.components.map((component) => (
              <li
                key={component.dimension}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-sm"
              >
                <div>
                  <p className="font-medium text-navy">{dimensionLabel(component.dimension)}</p>
                  <p className="text-xs text-text-secondary">
                    Weight {component.weight}
                    {component.metricCodes?.length
                      ? ` · ${component.metricCodes.length} metric(s)`
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  {component.included ? (
                    <p className="font-data text-navy">{component.score ?? "—"}</p>
                  ) : (
                    <p className="text-xs text-warning">
                      Excluded
                      {component.exclusionReason ? ` — ${component.exclusionReason}` : ""}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {quality?.details?.missingDimensions?.length ? (
        <p className="mt-4 text-sm text-text-secondary">
          Missing dimensions: {quality.details.missingDimensions.map(dimensionLabel).join(", ")}
        </p>
      ) : null}

      {presentation.limitations.length > 0 ? (
        <details className="mt-5 rounded-xl border border-border bg-workspace px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-navy">
            Eligibility & quality notes ({presentation.limitations.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-secondary">
            {presentation.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}
