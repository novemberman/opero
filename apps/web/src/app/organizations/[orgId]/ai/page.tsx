"use client";

import { roleHasPermission, type MembershipRole } from "@opero/shared";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { SiteHeader } from "../../../../components/site-header";
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
        apiErrorMessage(availabilityRes.body, "Unable to check whether AI interpretation is available"),
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
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
    <>
      <SiteHeader mark="AI interpretation" />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.16em] text-pine">Opero X-Ray</p>
            <h1 className="mt-2 text-3xl text-ink">AI interpretation</h1>
            <p className="mt-2 max-w-2xl text-muted">
              A drafted narrative over a completed diagnostic. It is written only from computed
              metrics, findings, data-quality measures and the score — uploaded files are never
              sent — and it is a draft for human review, not a source of new figures.
            </p>
          </div>
          <Link className="text-pine underline" href={`/organizations/${orgId}`}>
            Back to organization
          </Link>
        </div>

        {availabilityError ? (
          <p className="mb-6 border border-line p-4 text-sm text-copper">{availabilityError}</p>
        ) : null}
        {availability && !availability.available ? (
          <section className="mb-6 border border-line p-4">
            <h2 className="text-lg text-copper">AI interpretation is unavailable</h2>
            <p className="mt-1 text-sm text-muted">
              {availability.reason ?? "The AI provider is not available."} Diagnostics, readiness
              and reports work without it.
            </p>
          </section>
        ) : null}
        {availability?.available ? (
          <p className="mb-6 border border-line p-4 text-sm text-muted">
            Provider: <span className="text-ink">{availability.provider}</span>.{" "}
            {availability.simulated
              ? "This is a simulated provider: its text is assembled by fixed rules, not written by a live model, and is labelled as simulated wherever it appears."
              : "Structured diagnostic results for the selected run are sent to this provider."}
          </p>
        ) : null}

        {canWrite && availability?.available ? (
          <form onSubmit={onSubmit} className="mb-10 border border-line p-4">
            <h2 className="text-lg text-ink">Request an interpretation</h2>
            <label className="mt-3 block text-sm text-ink">
              Completed diagnostic run
              <select
                className="mt-1 block w-full border border-line px-2 py-2"
                value={diagnosticRunId}
                onChange={(event) => setDiagnosticRunId(event.target.value)}
              >
                <option value="">Select a run</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {runLabel(run)}
                  </option>
                ))}
              </select>
            </label>
            {loaded && runs.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                No completed diagnostic runs yet.{" "}
                <Link className="underline" href={`/organizations/${orgId}/diagnostics`}>
                  Run a diagnostic
                </Link>{" "}
                first.
              </p>
            ) : null}
            <label className="mt-3 block text-sm text-ink">
              Notes for the interpretation (optional)
              <textarea
                className="mt-1 block w-full border border-line px-2 py-1"
                rows={3}
                maxLength={2000}
                value={userNotes}
                onChange={(event) => setUserNotes(event.target.value)}
              />
            </label>
            <p className="mt-1 text-sm text-muted">
              Notes are passed to the provider as context alongside the structured results.
            </p>
            <button
              className="mt-4 rounded-full bg-pine px-5 py-2 text-paper disabled:opacity-50"
              type="submit"
              disabled={submitting || !diagnosticRunId}
            >
              {submitting ? "Requesting…" : "Generate draft"}
            </button>
          </form>
        ) : null}
        {loaded && !canWrite ? (
          <p className="mb-10 text-sm text-muted">
            View-only access: requesting an interpretation requires Analyst or higher.
          </p>
        ) : null}

        {error ? <p className="mb-4 text-sm text-copper">{error}</p> : null}

        <h2 className="text-xl text-ink">Interpretations</h2>
        <ul className="mt-3 divide-y divide-line border border-line">
          {interpretations.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <Link
                  className="font-medium text-ink underline"
                  href={`/organizations/${orgId}/ai/${row.id}`}
                >
                  Interpretation {row.id.slice(0, 8)}…
                </Link>
                <p className="text-sm text-muted">
                  {row.status} · {row.provider}
                  {row.versions[0]?.isSimulated ? " · simulated" : ""}
                  {row.versions[0]?.editedByUserId ? " · edited" : ""}
                  {" · diagnostic "}
                  <Link
                    className="underline"
                    href={`/organizations/${orgId}/diagnostics/${row.diagnosticRunId}`}
                  >
                    {row.diagnosticRunId.slice(0, 8)}…
                  </Link>
                </p>
                {row.failureMessage ? (
                  <p className="text-sm text-copper">{row.failureMessage}</p>
                ) : null}
              </div>
              <time className="text-sm text-muted">{new Date(row.createdAt).toLocaleString()}</time>
            </li>
          ))}
          {!loaded ? <li className="px-4 py-6 text-muted">Loading interpretations…</li> : null}
          {loaded && interpretations.length === 0 ? (
            <li className="px-4 py-6 text-muted">No AI interpretations yet.</li>
          ) : null}
        </ul>
      </main>
    </>
  );
}

export default function AiPage() {
  return (
    <Suspense fallback={null}>
      <AiContent />
    </Suspense>
  );
}
