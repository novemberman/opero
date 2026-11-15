"use client";

import { roleHasPermission, type MembershipRole } from "@opero/shared";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { AiAvailabilityBanner } from "../../../../components/ai/availability-banner";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Select,
  Skeleton,
  buttonClassName,
} from "../../../../components/ui";
import { aiRunStatusPresentation } from "../../../../lib/ai-interpretation-presentation";
import { apiErrorMessage, apiFetch } from "../../../../lib/api";
import {
  fetchOrgRole,
  fetchSucceededRuns,
  runLabel,
  type DiagnosticRunOption,
} from "../../../../lib/xray";

type Availability = {
  provider: string;
  simulated: boolean;
  shareStructuredContext: boolean;
  available: boolean;
  reason: string | null;
};

type InterpretationRow = {
  id: string;
  diagnosticRunId: string;
  status: string;
  provider: string;
  model: string | null;
  failureMessage: string | null;
  createdAt: string;
  versions: Array<{ id: string; isSimulated: boolean; editedByUserId: string | null }>;
};

function AiContent() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const initialRunId = useSearchParams().get("run") ?? "";

  const [role, setRole] = useState<MembershipRole | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [runs, setRuns] = useState<DiagnosticRunOption[]>([]);
  const [interpretations, setInterpretations] = useState<InterpretationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [diagnosticRunId, setDiagnosticRunId] = useState(initialRunId);
  const [userNotes, setUserNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = role ? roleHasPermission(role, "xray:write") : false;

  const load = useCallback(async () => {
    const base = `/organizations/${orgId}/ai`;
    const [availabilityRes, listRes, nextRuns, nextRole] = await Promise.all([
      apiFetch<{ availability?: Availability; message?: string }>(`${base}/availability`),
      apiFetch<{ runs?: InterpretationRow[]; message?: string }>(`${base}/interpretations`),
      fetchSucceededRuns(orgId),
      fetchOrgRole(orgId),
    ]);
    if (availabilityRes.status >= 400 || !availabilityRes.body.availability) {
      setAvailability(null);
      setAvailabilityError(
        apiErrorMessage(
          availabilityRes.body,
          "Unable to check whether AI interpretation is available",
        ),
      );
    } else {
      setAvailability(availabilityRes.body.availability);
      setAvailabilityError(null);
    }
    if (listRes.status >= 400) {
      setError(apiErrorMessage(listRes.body, "Unable to load AI interpretations"));
      setInterpretations([]);
    } else {
      setInterpretations(listRes.body.runs ?? []);
      setError(null);
    }
    setRuns(nextRuns);
    setRole(nextRole);
    setLoaded(true);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || !diagnosticRunId || !availability?.available) return;
    setSubmitting(true);
    setError(null);
    try {
      const { status, body } = await apiFetch<{ run?: { id: string }; message?: string }>(
        `/organizations/${orgId}/ai/interpretations`,
        {
          method: "POST",
          json: {
            diagnosticRunId,
            ...(userNotes.trim() ? { userNotes: userNotes.trim() } : {}),
          },
        },
      );
      if (status >= 400 || !body.run) {
        setError(apiErrorMessage(body, "Unable to request an AI interpretation"));
        return;
      }
      router.push(`/organizations/${orgId}/ai/${body.run.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8" data-testid="ai-interpretations">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald">
          Opero X-Ray
        </p>
        <h1 className="mt-2 text-3xl text-navy">AI interpretation</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          Evidence-grounded narrative drafts over completed diagnostics. Deterministic calculations
          stay authoritative; AI text is a draft for human review — never a source of new figures.
        </p>
      </header>

      <AiAvailabilityBanner availability={availability} error={availabilityError} />

      {canWrite && availability?.available ? (
        <Card>
          <CardHeader
            title="Request an interpretation"
            description="Only structured diagnostic results are sent. Uploaded files are never included."
          />
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <Select
              label="Completed diagnostic run"
              value={diagnosticRunId}
              onChange={(event) => setDiagnosticRunId(event.target.value)}
            >
              <option value="">Select a run</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {runLabel(run)}
                </option>
              ))}
            </Select>
            {loaded && runs.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No completed diagnostic runs yet.{" "}
                <Link className="text-emerald underline" href={`/organizations/${orgId}/diagnostics`}>
                  Run a diagnostic
                </Link>{" "}
                first.
              </p>
            ) : null}
            <label className="block text-sm font-medium text-navy">
              Notes for the interpretation (optional)
              <textarea
                className="mt-1 block w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                rows={3}
                maxLength={2000}
                value={userNotes}
                onChange={(event) => setUserNotes(event.target.value)}
              />
            </label>
            <Button type="submit" loading={submitting} disabled={submitting || !diagnosticRunId}>
              {submitting ? "Requesting…" : "Generate draft"}
            </Button>
          </form>
        </Card>
      ) : null}

      {loaded && !canWrite ? (
        <Alert tone="info" title="View-only access">
          Requesting an interpretation requires Analyst or higher.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="error" title="Unable to load interpretations">
          <div className="space-y-3">
            <p>{error}</p>
            <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      <section aria-labelledby="ai-list-heading" className="space-y-4">
        <h2 id="ai-list-heading" className="text-lg font-semibold text-navy">
          Interpretations
        </h2>
        {!loaded ? (
          <div className="space-y-3" data-testid="ai-loading">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : null}
        {loaded && interpretations.length === 0 ? (
          <EmptyState
            title="No AI interpretations yet"
            description="Request a draft after a diagnostic succeeds, when a provider is available."
            action={
              <Link
                href={`/organizations/${orgId}/diagnostics`}
                className={buttonClassName({ variant: "secondary", size: "sm" })}
              >
                Open diagnostics
              </Link>
            }
          />
        ) : null}
        <ul className="space-y-3">
          {interpretations.map((row) => {
            const status = aiRunStatusPresentation(row.status);
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm"
              >
                <div className="min-w-0">
                  <Link
                    className="font-medium text-navy no-underline hover:text-emerald"
                    href={`/organizations/${orgId}/ai/${row.id}`}
                  >
                    Interpretation {row.id.slice(0, 8)}…
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <Badge tone="neutral">{row.provider}</Badge>
                    {row.versions[0]?.isSimulated ? <Badge tone="warning">Simulated</Badge> : null}
                    {row.versions[0]?.editedByUserId ? (
                      <Badge tone="success">Human-reviewed</Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">
                    Diagnostic{" "}
                    <Link
                      className="text-emerald underline"
                      href={`/organizations/${orgId}/diagnostics/${row.diagnosticRunId}`}
                    >
                      {row.diagnosticRunId.slice(0, 8)}…
                    </Link>
                  </p>
                  {row.failureMessage ? (
                    <p className="mt-1 text-sm text-error">{row.failureMessage}</p>
                  ) : null}
                </div>
                <time className="font-data text-xs text-text-secondary">
                  {new Date(row.createdAt).toLocaleString()}
                </time>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export default function AiPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl space-y-3 p-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      }
    >
      <AiContent />
    </Suspense>
  );
}
