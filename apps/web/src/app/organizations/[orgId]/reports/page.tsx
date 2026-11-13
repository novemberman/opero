"use client";

import { roleHasPermission, type MembershipRole } from "@opero/shared";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { SiteHeader } from "../../../../components/site-header";
import { apiErrorMessage, apiFetch } from "../../../../lib/api";
import {
  fetchInterpretationOptions,
  fetchOrgRole,
  fetchSucceededRuns,
  runLabel,
  type DiagnosticRunOption,
  type InterpretationOption,
} from "../../../../lib/xray";

type ReportRow = {
  id: string;
  title: string;
  status: string;
  verifiedPublication: boolean;
  publishedAt: string | null;
  diagnosticRunId: string;
  createdAt: string;
  currentVersion: { id: string; versionNumber: number } | null;
};

type CreateError = { message: string; readinessBlocked: boolean; blockingReasons: string[] };

function ReportsContent() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const initialRunId = useSearchParams().get("run") ?? "";

  const [role, setRole] = useState<MembershipRole | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [runs, setRuns] = useState<DiagnosticRunOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [diagnosticRunId, setDiagnosticRunId] = useState(initialRunId);
  const [title, setTitle] = useState("");
  const [interpretations, setInterpretations] = useState<InterpretationOption[]>([]);
  const [aiVersionId, setAiVersionId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<CreateError | null>(null);
  const requestRef = useRef(0);

  const canWrite = role ? roleHasPermission(role, "xray:write") : false;

  const load = useCallback(async () => {
    const [listRes, nextRuns, nextRole] = await Promise.all([
      apiFetch<{ reports?: ReportRow[]; message?: string }>(`/organizations/${orgId}/reports`),
      fetchSucceededRuns(orgId),
      fetchOrgRole(orgId),
    ]);
    if (listRes.status >= 400) {
      setError(apiErrorMessage(listRes.body, "Unable to load reports"));
      setReports([]);
    } else {
      setReports(listRes.body.reports ?? []);
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

  /** Interpretations that can be attached to a report for the selected run. */
  const loadInterpretations = useCallback(async () => {
    const request = ++requestRef.current;
    setAiVersionId("");
    if (!diagnosticRunId) {
      setInterpretations([]);
      return;
    }
    const options = await fetchInterpretationOptions(orgId, diagnosticRunId);
    if (request !== requestRef.current) return;
    setInterpretations(options);
  }, [orgId, diagnosticRunId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on run change
    void loadInterpretations();
  }, [loadInterpretations]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || !diagnosticRunId) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const { status, body } = await apiFetch<{
        report?: { id: string };
        message?: string;
        code?: string;
        blockingReasons?: string[];
      }>(`/organizations/${orgId}/reports`, {
        method: "POST",
        json: {
          diagnosticRunId,
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(aiVersionId ? { aiInterpretationVersionId: aiVersionId } : {}),
        },
      });
      if (status >= 400 || !body.report) {
        setCreateError({
          message: apiErrorMessage(body, "Unable to create the report"),
          readinessBlocked: body?.code === "READINESS_BLOCKED",
          blockingReasons: body?.blockingReasons ?? [],
        });
        return;
      }
      router.push(`/organizations/${orgId}/reports/${body.report.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SiteHeader mark="Reports" />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.16em] text-pine">Opero X-Ray</p>
            <h1 className="mt-2 text-3xl text-ink">X-Ray reports</h1>
            <p className="mt-2 max-w-2xl text-muted">
              A report freezes the results of one completed diagnostic, goes through review and
              approval, and is published as a PDF. Published versions are never edited; changes
              create a new version.
            </p>
          </div>
          <Link className="text-pine underline" href={`/organizations/${orgId}`}>
            Back to organization
          </Link>
        </div>

        {canWrite ? (
          <form onSubmit={onCreate} className="mb-10 border border-line p-4">
            <h2 className="text-lg text-ink">Create a report</h2>
            <label className="mt-3 block text-sm text-ink">
              Completed diagnostic run
              <select
                className="mt-1 block w-full border border-line px-2 py-2"
                value={diagnosticRunId}
                onChange={(event) => {
                  setDiagnosticRunId(event.target.value);
                  setCreateError(null);
                }}
              >
                <option value="">Select a run</option>
                {diagnosticRunId && !runs.some((run) => run.id === diagnosticRunId) ? (
                  <option value={diagnosticRunId}>Run {diagnosticRunId.slice(0, 8)}…</option>
                ) : null}
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
              Title (optional)
              <input
                className="mt-1 block w-full border border-line px-2 py-1"
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="mt-3 block text-sm text-ink">
              AI interpretation (optional)
              <select
                className="mt-1 block w-full border border-line px-2 py-2"
                value={aiVersionId}
                disabled={interpretations.length === 0}
                onChange={(event) => setAiVersionId(event.target.value)}
              >
                <option value="">
                  {interpretations.length === 0
                    ? "None available for this run"
                    : "No AI interpretation"}
                </option>
                {interpretations.map((option) => (
                  <option key={option.versionId} value={option.versionId}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-1 text-sm text-muted">
              A report does not need an interpretation.{" "}
              <Link
                className="underline"
                href={`/organizations/${orgId}/ai${diagnosticRunId ? `?run=${diagnosticRunId}` : ""}`}
              >
                Generate or review one
              </Link>
              .
            </p>

            {createError ? (
              <div className="mt-3 text-sm text-copper">
                <p>{createError.message}</p>
                {createError.blockingReasons.length > 0 ? (
                  <ul className="mt-1 list-disc pl-5">
                    {createError.blockingReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
                {createError.readinessBlocked ? (
                  <p className="mt-1">
                    <Link
                      className="underline"
                      href={`/organizations/${orgId}/readiness?run=${diagnosticRunId}`}
                    >
                      Open the readiness checklist
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : null}

            <button
              className="mt-4 rounded-full bg-pine px-5 py-2 text-paper disabled:opacity-50"
              type="submit"
              disabled={submitting || !diagnosticRunId}
            >
              {submitting ? "Creating…" : "Create draft report"}
            </button>
          </form>
        ) : loaded ? (
          <p className="mb-10 text-sm text-muted">
            View-only access: creating reports requires Analyst or higher.
          </p>
        ) : null}

        {error ? <p className="mb-4 text-sm text-copper">{error}</p> : null}

        <ul className="divide-y divide-line border border-line">
          {reports.map((report) => (
            <li
              key={report.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <Link
                  className="font-medium text-ink underline"
                  href={`/organizations/${orgId}/reports/${report.id}`}
                >
                  {report.title}
                </Link>
                <p className="text-sm text-muted">
                  {report.status}
                  {report.currentVersion ? ` · version ${report.currentVersion.versionNumber}` : ""}
                  {report.status === "PUBLISHED"
                    ? report.verifiedPublication
                      ? " · verified publication"
                      : " · not verified"
                    : report.publishedAt
                      ? " · an earlier version is published"
                      : ""}
                </p>
              </div>
              <time className="text-sm text-muted">
                {new Date(report.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
          {!loaded ? <li className="px-4 py-6 text-muted">Loading reports…</li> : null}
          {loaded && !error && reports.length === 0 ? (
            <li className="px-4 py-6 text-muted">No reports yet.</li>
          ) : null}
        </ul>
      </main>
    </>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsContent />
    </Suspense>
  );
}
