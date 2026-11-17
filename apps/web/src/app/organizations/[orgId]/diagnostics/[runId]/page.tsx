"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FindingCard, type FindingInput } from "../../../../../components/diagnostics/finding-card";
import { HealthScorePanel } from "../../../../../components/diagnostics/health-score-panel";
import { MetricDimensionSections } from "../../../../../components/diagnostics/metric-dimension-section";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
  buttonClassName,
} from "../../../../../components/ui";
import { apiFetch } from "../../../../../lib/api";
import {
  distinctComputedPeriods,
  type MetricInput,
} from "../../../../../lib/diagnostic-metric-presentation";

type RunDetail = {
  id: string;
  status: string;
  currency: string | null;
  periodLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  calculationEngineVersion: string;
  ruleSetVersion: string;
  scoreMethodologyVersion: string;
  failureMessage?: string | null;
  snapshot?: { contentHash: string; documentIds: string[] } | null;
  quality?: {
    completeness: string;
    consistency: string;
    evidenceReliability: string;
    diagnosticCoverage: string;
    details?: { missingDimensions?: string[] };
  } | null;
  score?: {
    status: string;
    overallScore: number | null;
    limitations?: string[];
    components?: Array<{
      dimension: string;
      weight: number;
      included: boolean;
      score: number | null;
      exclusionReason: string | null;
      metricCodes?: string[];
    }>;
  } | null;
};

export default function DiagnosticRunPage() {
  const params = useParams<{ orgId: string; runId: string }>();
  const { orgId, runId } = params;
  const [run, setRun] = useState<RunDetail | null>(null);
  const [metrics, setMetrics] = useState<MetricInput[]>([]);
  const [findings, setFindings] = useState<FindingInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [runRes, metricsRes, findingsRes] = await Promise.all([
      apiFetch<{ run?: RunDetail; message?: string }>(
        `/organizations/${orgId}/diagnostics/${runId}`,
      ),
      apiFetch<{ metrics?: MetricInput[]; message?: string }>(
        `/organizations/${orgId}/diagnostics/${runId}/metrics`,
      ),
      apiFetch<{ findings?: FindingInput[]; message?: string }>(
        `/organizations/${orgId}/diagnostics/${runId}/findings`,
      ),
    ]);
    if (runRes.status >= 400) {
      setError(runRes.body.message ?? "Unable to load diagnostic run");
      setLoading(false);
      return;
    }
    setRun(runRes.body.run ?? null);
    setMetrics(metricsRes.body.metrics ?? []);
    setFindings(findingsRes.body.findings ?? []);
    setError(null);
    setLoading(false);
  }, [orgId, runId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 3000);
    return () => clearInterval(timer);
  }, [load]);

  const periods = distinctComputedPeriods(metrics);
  const pending = run?.status === "QUEUED" || run?.status === "RUNNING";

  return (
    <div className="mx-auto max-w-6xl space-y-8" data-testid="diagnostic-run-detail">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="brand-kicker">
            Opero X-Ray
          </p>
          <h1 className="mt-2 text-3xl text-navy">Diagnostic run</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {run ? <Badge tone={run.status === "SUCCEEDED" ? "success" : pending ? "info" : "neutral"}>{run.status}</Badge> : null}
            {run?.currency ? <Badge tone="neutral">{run.currency}</Badge> : null}
            {run?.periodLabel ? <Badge tone="neutral">{run.periodLabel}</Badge> : null}
          </div>
        </div>
        <Link
          className={buttonClassName({ variant: "ghost", size: "sm" })}
          href={`/organizations/${orgId}/diagnostics`}
        >
          All diagnostics
        </Link>
      </header>

      {error ? (
        <Alert tone="error" title="Unable to load diagnostic">
          <div className="space-y-3">
            <p>{error}</p>
            <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {run?.failureMessage ? (
        <Alert tone="error" title="Run failure">
          {run.failureMessage}
        </Alert>
      ) : null}

      {loading && !run ? (
        <div className="space-y-3" data-testid="diagnostic-detail-loading">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : null}

      {pending ? (
        <Alert tone="info" title="Diagnostic in progress">
          Metrics, findings and score eligibility update as the run completes. This page refreshes
          automatically.
        </Alert>
      ) : null}

      {run ? (
        <HealthScorePanel runStatus={run.status} score={run.score} quality={run.quality} />
      ) : null}

      {run?.status === "SUCCEEDED" ? (
        <Card>
          <CardHeader
            title="Next steps"
            description="Continue with readiness, evidence reconciliation, AI interpretation or reporting for this run."
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/organizations/${orgId}/readiness?run=${runId}`}
              className={buttonClassName({ variant: "secondary", size: "sm" })}
            >
              Check readiness
            </Link>
            <Link
              href={`/organizations/${orgId}/reconciliations?run=${runId}`}
              className={buttonClassName({ variant: "secondary", size: "sm" })}
            >
              Review evidence conflicts
            </Link>
            <Link
              href={`/organizations/${orgId}/ai?run=${runId}`}
              className={buttonClassName({ variant: "secondary", size: "sm" })}
            >
              AI interpretation
            </Link>
            <Link
              href={`/organizations/${orgId}/reports?run=${runId}`}
              className={buttonClassName({ variant: "secondary", size: "sm" })}
            >
              Create a report
            </Link>
          </div>
        </Card>
      ) : null}

      <section aria-labelledby="metrics-heading" className="space-y-4">
        <div>
          <h2 id="metrics-heading" className="text-xl font-semibold text-navy">
            Financial analysis
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Profitability, liquidity, leverage, efficiency and cash-flow measures from the
            diagnostic engine. Comparative periods appear only when distinct period labels exist in
            the returned metrics.
          </p>
          {periods.length > 1 ? (
            <p className="mt-2 text-sm text-emerald">
              Periods present in computed metrics: {periods.join(" · ")}
            </p>
          ) : (
            <p className="mt-2 text-sm text-text-secondary">
              Comparative trend charts are withheld — only{" "}
              {periods[0] ? `period “${periods[0]}”` : "a single period (or none)"} is present in
              the computed metric payload.
            </p>
          )}
        </div>
        {(() => {
          const missing = metrics.filter((m) => m.status === "INSUFFICIENT_INPUTS");
          const undefinedMath = metrics.filter((m) => m.status === "UNDEFINED");
          const incompatible = metrics.filter((m) => m.status === "INCOMPATIBLE");
          if (!missing.length && !undefinedMath.length && !incompatible.length) return null;
          return (
            <Alert tone="warning" title="Missing or blocked metric inputs">
              <p>
                {missing.length ? `${missing.length} insufficient` : null}
                {missing.length && (undefinedMath.length || incompatible.length) ? " · " : null}
                {undefinedMath.length ? `${undefinedMath.length} undefined` : null}
                {undefinedMath.length && incompatible.length ? " · " : null}
                {incompatible.length ? `${incompatible.length} incompatible` : null}
                . Missing values are not treated as zero; confirm source figures or supply comparable
                periods where required.
              </p>
            </Alert>
          );
        })()}
        <MetricDimensionSections metrics={metrics} />
      </section>

      <section aria-labelledby="findings-heading" className="space-y-4">
        <div>
          <h2 id="findings-heading" className="text-xl font-semibold text-navy">
            Findings
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Deterministic observations with source evidence links. Expand evidence for snapshot
            traceability.
          </p>
        </div>
        {findings.length === 0 ? (
          <EmptyState
            title="No findings for this run"
            description="Findings appear when rule evaluations produce observations or risks."
          />
        ) : (
          <ul className="space-y-3">
            {findings.map((finding) => (
              <FindingCard key={finding.id} finding={finding} orgId={orgId} />
            ))}
          </ul>
        )}
      </section>

      <Card>
        <CardHeader
          title="Methodology & limitations"
          description="Engine versions and score limitations from the run payload."
        />
        <p className="mt-3 text-sm text-text-secondary">
          Engine {run?.calculationEngineVersion ?? "…"} · Rules {run?.ruleSetVersion ?? "…"} · Score{" "}
          {run?.scoreMethodologyVersion ?? "…"}
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          Thresholds are provisional heuristics, not industry benchmarks. This is not a credit
          rating, audit opinion, or prediction of business survival. No implicit FX. Missing values
          are never treated as zero.
        </p>
        {run?.score?.limitations?.length ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-text-secondary">
            {run.score.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {run?.snapshot?.documentIds?.length ? (
          <p className="mt-4 text-sm text-text-secondary">
            Source documents:{" "}
            {run.snapshot.documentIds.map((id) => (
              <Link
                key={id}
                className="mr-2 text-emerald underline"
                href={`/organizations/${orgId}/documents/${id}`}
              >
                {id.slice(0, 8)}…
              </Link>
            ))}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
