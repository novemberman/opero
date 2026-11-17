"use client";

import { membershipRoleSchema, roleHasPermission, type MembershipRole } from "@opero/shared";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { HealthScorePanel } from "../../../../components/diagnostics/health-score-panel";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  Skeleton,
  buttonClassName,
} from "../../../../components/ui";
import { apiFetch } from "../../../../lib/api";
import { resolveHealthScorePresentation } from "../../../../lib/health-score-presentation";

type RunRow = {
  id: string;
  status: string;
  currency: string | null;
  periodLabel: string | null;
  createdAt: string;
  completedAt: string | null;
  score?: { status: string; overallScore: number | null } | null;
};

type DocRow = {
  id: string;
  originalFilename: string;
  scanStatus: string;
  processingStatus: string;
};

function runStatusTone(status: string): "success" | "warning" | "error" | "info" | "neutral" {
  if (status === "SUCCEEDED") return "success";
  if (status === "FAILED") return "error";
  if (status === "QUEUED" || status === "RUNNING") return "info";
  return "neutral";
}

export default function DiagnosticsPage() {
  const params = useParams<{ orgId: string }>();
  const router = useRouter();
  const orgId = params.orgId;
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<MembershipRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const canWrite = role ? roleHasPermission(role, "xray:write") : false;

  const load = useCallback(async () => {
    setLoading(true);
    const [runsRes, docsRes, orgsRes] = await Promise.all([
      apiFetch<{ runs?: RunRow[]; message?: string }>(`/organizations/${orgId}/diagnostics`),
      apiFetch<{ documents?: DocRow[]; message?: string }>(`/organizations/${orgId}/documents`),
      apiFetch<{
        organizations?: Array<{ role: string; organization: { id: string } }>;
        message?: string;
      }>("/organizations"),
    ]);
    if (runsRes.status >= 400) {
      setError(runsRes.body.message ?? "Unable to load diagnostics");
      setLoading(false);
      return;
    }
    const membership = orgsRes.body.organizations?.find((row) => row.organization.id === orgId);
    const parsedRole = membership ? membershipRoleSchema.safeParse(membership.role) : null;
    setRole(parsedRole?.success ? parsedRole.data : null);
    setRuns(runsRes.body.runs ?? []);
    setDocuments(
      (docsRes.body.documents ?? []).filter(
        (d) => d.scanStatus === "CLEAN" && d.processingStatus === "READY",
      ),
    );
    setError(null);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleDoc(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onStart(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || selected.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ run?: { id: string }; message?: string }>(
        `/organizations/${orgId}/diagnostics`,
        {
          method: "POST",
          // Omit currency so the engine derives statement currency (e.g. NGN); do not force USD.
          json: { documentIds: selected },
        },
      );
      if (res.status >= 400) {
        setError(res.body.message ?? "Unable to start diagnostic");
        return;
      }
      setSelected([]);
      await load();
      if (res.body.run?.id) {
        router.push(`/organizations/${orgId}/diagnostics/${res.body.run.id}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const latestSucceeded = runs.find((run) => run.status === "SUCCEEDED") ?? null;
  const latestPresentation = latestSucceeded
    ? resolveHealthScorePresentation({
        runStatus: latestSucceeded.status,
        score: latestSucceeded.score,
      })
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8" data-testid="diagnostics-overview">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="brand-kicker">
            Opero X-Ray
          </p>
          <h1 className="mt-2 text-3xl text-navy">Diagnostics</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Deterministic KPIs, data-quality measures and a provisional Business Health Score from
            reviewed financial evidence. Missing data reduces coverage — it is never treated as
            zero.
          </p>
        </div>
      </header>

      {error ? (
        <Alert tone="error" title="Unable to load diagnostics">
          <div className="space-y-3">
            <p>{error}</p>
            <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {loading ? (
        <div className="space-y-3" data-testid="diagnostics-loading">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {!loading && latestSucceeded ? (
        <HealthScorePanel
          runStatus={latestSucceeded.status}
          score={latestSucceeded.score}
          className="!p-5"
        />
      ) : null}

      {!loading && !latestSucceeded && latestPresentation == null ? (
        <EmptyState
          title="No completed diagnostics yet"
          description="Run diagnostics on READY, clean-scanned documents to see Business Health Score eligibility and ratio analysis."
          action={
            <Link
              href={`/organizations/${orgId}/documents`}
              className={buttonClassName({ variant: "secondary", size: "sm" })}
            >
              Open documents
            </Link>
          }
        />
      ) : null}

      {canWrite ? (
        <Card>
          <CardHeader
            title="Start a diagnostic run"
            description="Select clean-scanned documents. Results stay reproducible via an immutable input snapshot."
          />
          <form onSubmit={onStart} className="mt-4">
            <ul className="max-h-48 space-y-2 overflow-auto">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <Checkbox
                    label={doc.originalFilename}
                    checked={selected.includes(doc.id)}
                    onChange={() => toggleDoc(doc.id)}
                  />
                </li>
              ))}
              {documents.length === 0 ? (
                <li className="text-sm text-text-secondary">
                  No eligible documents.{" "}
                  <Link className="text-emerald underline" href={`/organizations/${orgId}/documents`}>
                    Upload documents
                  </Link>{" "}
                  first.
                </li>
              ) : null}
            </ul>
            <Button
              className="mt-4"
              type="submit"
              loading={submitting}
              disabled={submitting || selected.length === 0}
            >
              {submitting ? "Starting…" : "Run diagnostics"}
            </Button>
          </form>
        </Card>
      ) : (
        <Alert tone="info" title="View-only access">
          Starting diagnostics requires Analyst or higher.
        </Alert>
      )}

      <section aria-labelledby="runs-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="runs-heading" className="text-lg font-semibold text-navy">
            Diagnostic runs
          </h2>
          <p className="text-sm text-text-secondary">{runs.length} run{runs.length === 1 ? "" : "s"}</p>
        </div>

        {!loading && runs.length === 0 ? (
          <EmptyState
            title="No diagnostic runs"
            description="Completed runs appear here with eligibility status and period context."
          />
        ) : null}

        <ul className="space-y-3">
          {runs.map((run) => {
            const scorePresentation = resolveHealthScorePresentation({
              runStatus: run.status,
              score: run.score,
            });
            return (
              <li
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm"
              >
                <div className="min-w-0">
                  <Link
                    className="font-medium text-navy no-underline hover:text-emerald"
                    href={`/organizations/${orgId}/diagnostics/${run.id}`}
                  >
                    Run {run.id.slice(0, 8)}…
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
                    <Badge tone={scorePresentation.badgeTone}>{scorePresentation.badgeLabel}</Badge>
                    {run.currency ? <Badge tone="neutral">{run.currency}</Badge> : null}
                    {run.periodLabel ? <Badge tone="neutral">{run.periodLabel}</Badge> : null}
                    {scorePresentation.kind === "scored" && scorePresentation.scoreText ? (
                      <span className="font-data text-sm text-emerald">
                        Score {scorePresentation.scoreText}
                      </span>
                    ) : null}
                  </div>
                </div>
                <time className="font-data text-xs text-text-secondary">
                  {new Date(run.createdAt).toLocaleString()}
                </time>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
