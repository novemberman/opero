"use client";

import { roleHasPermission, type MembershipRole } from "@opero/shared";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { SiteHeader } from "../../../../components/site-header";
import { apiErrorMessage, apiFetch } from "../../../../lib/api";
import {
  fetchOrgRole,
  fetchSucceededRuns,
  runLabel,
  type DiagnosticRunOption,
} from "../../../../lib/xray";

type ChecklistItem = {
  id: string;
  label: string;
  passed: boolean;
  required: boolean;
  detail?: string;
};

type Issue = {
  code: string;
  severity: string;
  title: string;
  detail: string;
  blocking: boolean;
};

type Assessment = {
  id: string;
  status: "READY" | "PARTIALLY_READY" | "ACTION_REQUIRED" | "BLOCKED";
  diagnosticRunId: string | null;
  documentIds: string[];
  checklist: ChecklistItem[];
  issues: Issue[];
  blockingReasons: string[] | null;
  createdAt: string;
};

type DocRow = {
  id: string;
  originalFilename: string;
  scanStatus: string;
  processingStatus: string;
};

const STATUS_TEXT: Record<Assessment["status"], string> = {
  READY: "Every check passed.",
  PARTIALLY_READY: "Usable, with minor gaps that will be disclosed on a report.",
  ACTION_REQUIRED: "Not blocked, but there are issues that should be dealt with first.",
  BLOCKED: "A required check failed. A report cannot be created or published.",
};

function ReadinessContent() {
  const { orgId } = useParams<{ orgId: string }>();
  const initialRunId = useSearchParams().get("run") ?? "";

  const [role, setRole] = useState<MembershipRole | null>(null);
  const [runs, setRuns] = useState<DiagnosticRunOption[]>([]);
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [ready, setReady] = useState(false);
  const [runId, setRunId] = useState(initialRunId);
  const [selected, setSelected] = useState<string[]>([]);
  const [runDocumentIds, setRunDocumentIds] = useState<string[]>([]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const canWrite = role ? roleHasPermission(role, "xray:write") : false;
  const scopeDocumentIds = runId ? runDocumentIds : selected;

  const loadPage = useCallback(async () => {
    const [docsRes, nextRuns, nextRole] = await Promise.all([
      apiFetch<{ documents?: DocRow[]; message?: string }>(`/organizations/${orgId}/documents`),
      fetchSucceededRuns(orgId),
      fetchOrgRole(orgId),
    ]);
    if (docsRes.status >= 400) {
      setError(apiErrorMessage(docsRes.body, "Unable to load documents"));
    }
    setDocuments(docsRes.status >= 400 ? [] : (docsRes.body.documents ?? []));
    setRuns(nextRuns);
    setRole(nextRole);
    setReady(true);
  }, [orgId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
    void loadPage();
  }, [loadPage]);

  /** Loads the most recent stored assessment for the current scope. */
  const loadAssessment = useCallback(async () => {
    const request = ++requestRef.current;
    if (!runId && selected.length === 0) {
      setAssessment(null);
      setRunDocumentIds([]);
      setAssessmentLoading(false);
      return;
    }
    setAssessmentLoading(true);
    const base = `/organizations/${orgId}`;
    const [latestRes, runRes] = await Promise.all([
      apiFetch<{ assessment?: Assessment | null; message?: string }>(
        runId
          ? `${base}/readiness/latest?diagnosticRunId=${runId}`
          : `${base}/readiness/latest?documentIds=${selected.join(",")}`,
      ),
      runId
        ? apiFetch<{ run?: { snapshot?: { documentIds: string[] } | null }; message?: string }>(
            `${base}/diagnostics/${runId}`,
          )
        : Promise.resolve(null),
    ]);
    if (request !== requestRef.current) return;
    setAssessmentLoading(false);
    if (runRes && runRes.status >= 400) {
      setError(apiErrorMessage(runRes.body, "Unable to load the diagnostic run"));
      setRunDocumentIds([]);
      setAssessment(null);
      return;
    }
    if (latestRes.status >= 400) {
      setError(apiErrorMessage(latestRes.body, "Unable to load the readiness assessment"));
      setAssessment(null);
      return;
    }
    setRunDocumentIds(runRes?.body.run?.snapshot?.documentIds ?? []);
    setAssessment(latestRes.body.assessment ?? null);
    setError(null);
  }, [orgId, runId, selected]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on scope change
    void loadAssessment();
  }, [loadAssessment]);

  function toggleDocument(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onAssess() {
    if (!canWrite || scopeDocumentIds.length === 0) return;
    setAssessing(true);
    setError(null);
    try {
      const { status, body } = await apiFetch<{ assessment?: Assessment; message?: string }>(
        `/organizations/${orgId}/readiness/assess`,
        {
          method: "POST",
          json: {
            documentIds: scopeDocumentIds,
            ...(runId ? { diagnosticRunId: runId } : {}),
          },
        },
      );
      if (status >= 400) {
        setError(apiErrorMessage(body, "Unable to assess readiness"));
        return;
      }
      setAssessment(body.assessment ?? null);
    } finally {
      setAssessing(false);
    }
  }

  const reconciliationsHref = runId
    ? `/organizations/${orgId}/reconciliations?run=${runId}`
    : `/organizations/${orgId}/reconciliations`;
  const filenames = new Map(documents.map((doc) => [doc.id, doc.originalFilename]));

  return (
    <>
      <SiteHeader mark="Readiness" />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.16em] text-pine">Opero X-Ray</p>
            <h1 className="mt-2 text-3xl text-ink">Diagnostic readiness</h1>
            <p className="mt-2 max-w-2xl text-muted">
              Checks whether the selected evidence is complete enough to report on. Readiness never
              changes a score; a BLOCKED result stops report creation and publication.
            </p>
          </div>
          <Link className="text-pine underline" href={`/organizations/${orgId}`}>
            Back to organization
          </Link>
        </div>

        <section className="mb-8 border border-line p-4">
          <h2 className="text-lg text-ink">What to assess</h2>
          <label className="mt-3 block text-sm text-ink">
            Diagnostic run
            <select
              className="mt-1 block w-full border border-line px-2 py-2"
              value={runId}
              onChange={(event) => setRunId(event.target.value)}
            >
              <option value="">None — choose documents below</option>
              {runId && !runs.some((run) => run.id === runId) ? (
                <option value={runId}>Run {runId.slice(0, 8)}…</option>
              ) : null}
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {runLabel(run)}
                </option>
              ))}
            </select>
          </label>

          {runId ? (
            <p className="mt-3 text-sm text-muted">
              {runDocumentIds.length > 0
                ? `Uses the ${runDocumentIds.length} document(s) from this run's input snapshot: `
                : "Loading the run's documents…"}
              {runDocumentIds.map((id) => (
                <Link
                  key={id}
                  className="mr-2 underline"
                  href={`/organizations/${orgId}/documents/${id}`}
                >
                  {filenames.get(id) ?? `${id.slice(0, 8)}…`}
                </Link>
              ))}
            </p>
          ) : (
            <ul className="mt-4 max-h-48 space-y-2 overflow-auto">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={selected.includes(doc.id)}
                      onChange={() => toggleDocument(doc.id)}
                    />
                    {doc.originalFilename}
                    <span className="text-muted">
                      scan {doc.scanStatus} · {doc.processingStatus}
                    </span>
                  </label>
                </li>
              ))}
              {!ready ? <li className="text-sm text-muted">Loading documents…</li> : null}
              {ready && documents.length === 0 ? (
                <li className="text-sm text-muted">
                  No documents yet.{" "}
                  <Link className="underline" href={`/organizations/${orgId}/documents`}>
                    Upload documents
                  </Link>{" "}
                  first.
                </li>
              ) : null}
            </ul>
          )}

          {canWrite ? (
            <button
              className="mt-4 rounded-full bg-pine px-5 py-2 text-paper disabled:opacity-50"
              type="button"
              disabled={assessing || scopeDocumentIds.length === 0}
              onClick={() => void onAssess()}
            >
              {assessing ? "Assessing…" : assessment ? "Assess again" : "Assess readiness"}
            </button>
          ) : ready ? (
            <p className="mt-4 text-sm text-muted">
              View-only access: running an assessment requires Analyst or higher.
            </p>
          ) : null}
        </section>

        {error ? <p className="mb-4 text-sm text-copper">{error}</p> : null}

        {assessmentLoading ? <p className="text-muted">Loading assessment…</p> : null}

        {!assessmentLoading && !assessment ? (
          <p className="text-muted">
            {scopeDocumentIds.length === 0 && !runId
              ? "Choose a diagnostic run or at least one document to see its readiness."
              : "No readiness assessment has been recorded for this selection yet."}
          </p>
        ) : null}

        {!assessmentLoading && assessment ? (
          <>
            <section className="mb-8 border border-line p-5">
              <h2 className="text-xl text-ink">Status</h2>
              <p
                className={`mt-3 text-3xl ${
                  assessment.status === "READY" ? "text-pine" : "text-copper"
                }`}
              >
                {assessment.status}
              </p>
              <p className="mt-2 text-sm text-muted">{STATUS_TEXT[assessment.status]}</p>
              <p className="mt-2 text-sm text-muted">
                Assessed {new Date(assessment.createdAt).toLocaleString()} ·{" "}
                {assessment.documentIds.length} document(s)
              </p>
              {assessment.blockingReasons?.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-copper">
                  {assessment.blockingReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="mb-8">
              <h2 className="text-xl text-ink">Checklist</h2>
              <ul className="mt-3 divide-y divide-line border border-line">
                {assessment.checklist.map((item) => (
                  <li key={item.id} className="flex flex-wrap justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-ink">{item.label}</p>
                      <p className="text-sm text-muted">
                        {item.required ? "Required" : "Recommended"}
                        {item.detail ? ` · ${item.detail}` : ""}
                      </p>
                    </div>
                    <span className={`text-sm ${item.passed ? "text-pine" : "text-copper"}`}>
                      {item.passed ? "Passed" : "Not passed"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl text-ink">Issues</h2>
              <ul className="mt-3 space-y-3">
                {assessment.issues.map((issue) => (
                  <li key={issue.code} className="border border-line p-4">
                    <p className="text-sm uppercase tracking-wide text-muted">
                      {issue.severity}
                      {issue.blocking ? " · blocking" : ""}
                    </p>
                    <h3 className="mt-1 text-lg text-ink">{issue.title}</h3>
                    <p className="mt-1 text-sm text-muted">{issue.detail}</p>
                  </li>
                ))}
                {assessment.issues.length === 0 ? (
                  <li className="text-muted">No issues were found.</li>
                ) : null}
              </ul>
            </section>

            <section className="border border-line p-4 text-sm text-muted">
              <h2 className="text-base text-ink">How to clear issues</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Evidence conflicts are resolved under{" "}
                  <Link className="underline" href={reconciliationsHref}>
                    Reconciliations
                  </Link>
                  .
                </li>
                <li>
                  Currency, period and other statement metadata are corrected and confirmed on each
                  document:{" "}
                  {assessment.documentIds.map((id) => (
                    <Link
                      key={id}
                      className="mr-2 underline"
                      href={`/organizations/${orgId}/documents/${id}`}
                    >
                      {filenames.get(id) ?? `${id.slice(0, 8)}…`}
                    </Link>
                  ))}
                </li>
                <li>Assess again afterwards; each assessment is stored as a new record.</li>
              </ul>
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}

export default function ReadinessPage() {
  return (
    <Suspense fallback={null}>
      <ReadinessContent />
    </Suspense>
  );
}
