"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SiteHeader } from "../../../../../components/site-header";
import { apiFetch } from "../../../../../lib/api";

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
    }>;
  } | null;
};

type Metric = {
  code: string;
  label: string;
  dimension: string;
  status: string;
  value: string | null;
  unit: string | null;
};

type Finding = {
  id: string;
  ruleId: string;
  category: string;
  severity: string;
  title: string;
  explanation: string;
  implication: string;
  suggestedAction: string;
  evidence: Array<{
    snapshotKey: string;
    documentId: string | null;
    label: string | null;
  }>;
};

export default function DiagnosticRunPage() {
  const params = useParams<{ orgId: string; runId: string }>();
  const { orgId, runId } = params;
  const [run, setRun] = useState<RunDetail | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [runRes, metricsRes, findingsRes] = await Promise.all([
      apiFetch<{ run?: RunDetail; message?: string }>(
        `/organizations/${orgId}/diagnostics/${runId}`,
      ),
      apiFetch<{ metrics?: Metric[]; message?: string }>(
        `/organizations/${orgId}/diagnostics/${runId}/metrics`,
      ),
      apiFetch<{ findings?: Finding[]; message?: string }>(
        `/organizations/${orgId}/diagnostics/${runId}/findings`,
      ),
    ]);
    if (runRes.status >= 400) {
      setError(runRes.body.message ?? "Unable to load diagnostic run");
      return;
    }
    setRun(runRes.body.run ?? null);
    setMetrics(metricsRes.body.metrics ?? []);
    setFindings(findingsRes.body.findings ?? []);
    setError(null);
  }, [orgId, runId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount/poll
    void load();
    const timer = setInterval(() => {
      void load();
    }, 3000);
    return () => clearInterval(timer);
  }, [load]);

  const computed = metrics.filter((m) => m.status === "COMPUTED");
  const missing = metrics.filter((m) => m.status !== "COMPUTED");

  return (
    <>
      <SiteHeader mark="Diagnostic run" />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.16em] text-pine">Opero X-Ray</p>
            <h1 className="mt-2 text-3xl text-ink">Diagnostic run</h1>
            <p className="mt-2 text-muted">
              Status {run?.status ?? "…"}
              {run?.currency ? ` · ${run.currency}` : ""}
              {run?.periodLabel ? ` · ${run.periodLabel}` : ""}
            </p>
          </div>
          <Link className="text-pine underline" href={`/organizations/${orgId}/diagnostics`}>
            All diagnostics
          </Link>
        </div>

        {error ? <p className="mb-4 text-sm text-copper">{error}</p> : null}
        {run?.failureMessage ? (
          <p className="mb-4 text-sm text-copper">{run.failureMessage}</p>
        ) : null}

        <section className="mb-10 border border-line p-5">
          <h2 className="text-xl text-ink">Business Health Score</h2>
          {run?.score?.status === "SCORED" ? (
            <p className="mt-3 text-5xl text-pine">{run.score.overallScore}</p>
          ) : run?.status === "SUCCEEDED" ? (
            <p className="mt-3 text-2xl text-copper">INSUFFICIENT_DATA</p>
          ) : (
            <p className="mt-3 text-muted">Score available when the run completes.</p>
          )}
          {run?.score?.components ? (
            <ul className="mt-4 space-y-1 text-sm text-muted">
              {run.score.components.map((c) => (
                <li key={c.dimension}>
                  {c.dimension} (w{c.weight}):{" "}
                  {c.included ? c.score : `excluded — ${c.exclusionReason}`}
                </li>
              ))}
            </ul>
          ) : null}
          {run?.quality ? (
            <p className="mt-4 text-sm text-muted">
              Completeness {run.quality.completeness} · Consistency {run.quality.consistency} ·
              Reliability {run.quality.evidenceReliability} · Coverage{" "}
              {run.quality.diagnosticCoverage}
            </p>
          ) : null}
        </section>

        <section className="mb-10">
          <h2 className="text-xl text-ink">Key metrics</h2>
          <ul className="mt-3 divide-y divide-line border border-line">
            {computed.map((m) => (
              <li key={m.code} className="flex justify-between gap-3 px-4 py-2 text-sm">
                <span className="text-ink">
                  {m.label} <span className="text-muted">({m.dimension})</span>
                </span>
                <span className="text-ink">
                  {m.value}
                  {m.unit === "ratio" ? "" : m.unit ? ` ${m.unit}` : ""}
                </span>
              </li>
            ))}
            {computed.length === 0 ? (
              <li className="px-4 py-4 text-muted">No computed metrics yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl text-ink">Findings</h2>
          <ul className="mt-3 space-y-3">
            {findings.map((f) => (
              <li key={f.id} className="border border-line p-4">
                <p className="text-sm uppercase tracking-wide text-muted">
                  {f.category} · {f.severity} · {f.ruleId}
                </p>
                <h3 className="mt-1 text-lg text-ink">{f.title}</h3>
                <p className="mt-2 text-sm text-muted">{f.explanation}</p>
                <p className="mt-2 text-sm text-ink">{f.implication}</p>
                <p className="mt-2 text-sm text-pine">{f.suggestedAction}</p>
                {f.evidence.length ? (
                  <ul className="mt-3 space-y-1 text-sm">
                    {f.evidence.map((e) => (
                      <li key={e.snapshotKey}>
                        {e.documentId ? (
                          <Link
                            className="underline"
                            href={`/organizations/${orgId}/documents/${e.documentId}`}
                          >
                            {e.label ?? "Evidence"}
                          </Link>
                        ) : (
                          (e.label ?? e.snapshotKey)
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
            {findings.length === 0 ? (
              <li className="text-muted">No findings for this run.</li>
            ) : null}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl text-ink">Missing or uncomputed</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
            {missing.slice(0, 20).map((m) => (
              <li key={m.code}>
                {m.label}: {m.status}
              </li>
            ))}
            {(run?.quality?.details?.missingDimensions ?? []).map((d) => (
              <li key={d}>Missing dimension: {d}</li>
            ))}
          </ul>
        </section>

        <section className="border border-line p-4 text-sm text-muted">
          <h2 className="text-base text-ink">Methodology & limitations</h2>
          <p className="mt-2">
            Engine {run?.calculationEngineVersion ?? "…"} · Rules {run?.ruleSetVersion ?? "…"} ·
            Score {run?.scoreMethodologyVersion ?? "…"}
          </p>
          <p className="mt-2">
            Thresholds are provisional heuristics, not industry benchmarks. This is not a credit
            rating, audit opinion, or prediction of business survival. No implicit FX. Missing
            values are never treated as zero. See repository{" "}
            <code>docs/DIAGNOSTIC_METHODOLOGY.md</code>.
          </p>
          {run?.score?.limitations?.length ? (
            <ul className="mt-2 list-disc pl-5">
              {run.score.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : null}
          {run?.snapshot?.documentIds?.length ? (
            <p className="mt-3">
              Source documents:{" "}
              {run.snapshot.documentIds.map((id) => (
                <Link
                  key={id}
                  className="mr-2 underline"
                  href={`/organizations/${orgId}/documents/${id}`}
                >
                  {id.slice(0, 8)}…
                </Link>
              ))}
            </p>
          ) : null}
        </section>
      </main>
    </>
  );
}
