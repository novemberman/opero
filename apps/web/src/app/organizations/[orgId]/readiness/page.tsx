"use client";

import { roleHasPermission, type MembershipRole } from "@opero/shared";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ReadinessChecklist } from "../../../../components/readiness/readiness-checklist";
import { ReadinessIssues } from "../../../../components/readiness/readiness-issues";
import { ReadinessStatusPanel } from "../../../../components/readiness/readiness-status-panel";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  Select,
  Skeleton,
  buttonClassName,
} from "../../../../components/ui";
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
    void loadPage();
  }, [loadPage]);

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

  const filenames = new Map(documents.map((doc) => [doc.id, doc.originalFilename]));

  return (
    <div className="mx-auto max-w-6xl space-y-8" data-testid="readiness-workspace">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald">
          Opero X-Ray
        </p>
        <h1 className="mt-2 text-3xl text-navy">Readiness assessment</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          Decision-support for whether selected evidence is complete enough to report on. Readiness
          never changes a score; a BLOCKED result stops report creation and publication.
        </p>
      </header>

      <Card>
        <CardHeader
          title="Assessment scope"
          description="Choose a completed diagnostic run or individual documents. Outcomes come only from the readiness assessment API."
        />
        <div className="mt-4 space-y-4">
          <Select
            label="Diagnostic run"
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
          </Select>

          {runId ? (
            <p className="text-sm text-text-secondary">
              {runDocumentIds.length > 0
                ? `Uses the ${runDocumentIds.length} document(s) from this run's input snapshot: `
                : "Loading the run's documents…"}
              {runDocumentIds.map((id) => (
                <Link
                  key={id}
                  className="mr-2 text-emerald underline"
                  href={`/organizations/${orgId}/documents/${id}`}
                >
                  {filenames.get(id) ?? `${id.slice(0, 8)}…`}
                </Link>
              ))}
            </p>
          ) : (
            <ul className="max-h-48 space-y-2 overflow-auto">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <Checkbox
                    label={`${doc.originalFilename} (scan ${doc.scanStatus} · ${doc.processingStatus})`}
                    checked={selected.includes(doc.id)}
                    onChange={() => toggleDocument(doc.id)}
                  />
                </li>
              ))}
              {!ready ? <li className="text-sm text-text-secondary">Loading documents…</li> : null}
              {ready && documents.length === 0 ? (
                <li className="text-sm text-text-secondary">
                  No documents yet.{" "}
                  <Link className="text-emerald underline" href={`/organizations/${orgId}/documents`}>
                    Upload documents
                  </Link>{" "}
                  first.
                </li>
              ) : null}
            </ul>
          )}

          {canWrite ? (
            <Button
              type="button"
              loading={assessing}
              disabled={assessing || scopeDocumentIds.length === 0}
              onClick={() => void onAssess()}
            >
              {assessing ? "Assessing…" : assessment ? "Assess again" : "Assess readiness"}
            </Button>
          ) : ready ? (
            <Alert tone="info" title="View-only access">
              Running an assessment requires Analyst or higher.
            </Alert>
          ) : null}
        </div>
      </Card>

      {error ? (
        <Alert tone="error" title="Readiness error">
          <div className="space-y-3">
            <p>{error}</p>
            <Button type="button" size="sm" variant="secondary" onClick={() => void loadAssessment()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {assessmentLoading ? (
        <div className="space-y-3" data-testid="readiness-loading">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : null}

      {!assessmentLoading && !assessment ? (
        <EmptyState
          title="No assessment for this scope"
          description={
            scopeDocumentIds.length === 0 && !runId
              ? "Choose a diagnostic run or at least one document to see readiness."
              : "No readiness assessment has been recorded for this selection yet."
          }
        />
      ) : null}

      {!assessmentLoading && assessment ? (
        <>
          <ReadinessStatusPanel
            status={assessment.status}
            createdAt={assessment.createdAt}
            documentCount={assessment.documentIds.length}
            blockingReasons={assessment.blockingReasons}
          />
          <ReadinessChecklist items={assessment.checklist} />
          <ReadinessIssues
            issues={assessment.issues}
            orgId={orgId}
            documentIds={assessment.documentIds}
            diagnosticRunId={assessment.diagnosticRunId}
          />
          <Card>
            <CardHeader
              title="Available outcomes"
              description="Status values returned by the readiness engine — not invented in the UI."
            />
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-text-secondary">
              <li>
                <strong className="text-navy">READY</strong> — required checks passed; reporting may
                proceed.
              </li>
              <li>
                <strong className="text-navy">PARTIALLY_READY</strong> — usable with disclosed gaps.
              </li>
              <li>
                <strong className="text-navy">ACTION_REQUIRED</strong> — resolve issues before treating
                as report-ready.
              </li>
              <li>
                <strong className="text-navy">BLOCKED</strong> — report creation/publication gated.
              </li>
            </ul>
            {assessment.status === "READY" || assessment.status === "PARTIALLY_READY" ? (
              <Link
                href={
                  assessment.diagnosticRunId
                    ? `/organizations/${orgId}/reports?run=${assessment.diagnosticRunId}`
                    : `/organizations/${orgId}/reports`
                }
                className={buttonClassName({ variant: "primary", size: "sm", className: "mt-4" })}
              >
                Continue to reports
              </Link>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
}

export default function ReadinessPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl space-y-3 p-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      <ReadinessContent />
    </Suspense>
  );
}
