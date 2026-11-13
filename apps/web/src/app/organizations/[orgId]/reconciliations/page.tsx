"use client";

import { roleHasPermission, type MembershipRole } from "@opero/shared";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { SiteHeader } from "../../../../components/site-header";
import { apiErrorMessage, apiFetch } from "../../../../lib/api";
import {
  fetchOrgRole,
  fetchSucceededRuns,
  runLabel,
  type DiagnosticRunOption,
} from "../../../../lib/xray";

type Item = {
  id: string;
  documentId: string | null;
  lineItemId: string | null;
  label: string;
  value: string | null;
  currency: string | null;
  periodLabel: string | null;
  isAuthoritative: boolean;
};

type Reconciliation = {
  id: string;
  diagnosticRunId: string | null;
  concept: string | null;
  severity: string;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  title: string;
  explanation: string;
  resolution: "SELECT_AUTHORITATIVE" | "CORRECT_VALUE" | "DISMISS" | null;
  resolvedValue: string | null;
  resolutionReason: string | null;
  resolvedAt: string | null;
  createdAt: string;
  items: Item[];
};

type Resolution = NonNullable<Reconciliation["resolution"]>;

const STATUS_FILTERS = ["OPEN", "RESOLVED", "DISMISSED", "ALL"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const RESOLUTION_LABELS: Record<Resolution, string> = {
  SELECT_AUTHORITATIVE: "Select the authoritative source",
  CORRECT_VALUE: "Record a corrected value",
  DISMISS: "Dismiss as not a real conflict",
};

function ResolveForm(props: {
  orgId: string;
  reconciliation: Reconciliation;
  onResolved: () => Promise<void>;
}) {
  const { orgId, reconciliation, onResolved } = props;
  const selectable = reconciliation.items.filter((item) => item.lineItemId);
  const [resolution, setResolution] = useState<Resolution>(
    selectable.length > 0 ? "SELECT_AUTHORITATIVE" : "CORRECT_VALUE",
  );
  const [selectedLineItemId, setSelectedLineItemId] = useState("");
  const [correctedValue, setCorrectedValue] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (resolution === "SELECT_AUTHORITATIVE" && !selectedLineItemId) {
      setError("Choose which source is authoritative.");
      return;
    }
    if (resolution === "CORRECT_VALUE" && !correctedValue.trim()) {
      setError("Enter the corrected value.");
      return;
    }
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { status, body } = await apiFetch<{ message?: string }>(
        `/organizations/${orgId}/reconciliations/${reconciliation.id}/resolve`,
        {
          method: "POST",
          json: {
            resolution,
            reason: reason.trim(),
            ...(resolution === "SELECT_AUTHORITATIVE" ? { selectedLineItemId } : {}),
            ...(resolution === "CORRECT_VALUE" ? { correctedValue: correctedValue.trim() } : {}),
          },
        },
      );
      if (status >= 400) {
        setError(apiErrorMessage(body, "Unable to resolve the conflict"));
        return;
      }
      await onResolved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="mt-4 border-t border-line pt-4" onSubmit={onSubmit}>
      <label className="block text-sm text-ink">
        Resolution
        <select
          className="mt-1 block w-full border border-line px-2 py-1"
          value={resolution}
          onChange={(event) => setResolution(event.target.value as Resolution)}
        >
          {(Object.keys(RESOLUTION_LABELS) as Resolution[])
            .filter((option) => option !== "SELECT_AUTHORITATIVE" || selectable.length > 0)
            .map((option) => (
              <option key={option} value={option}>
                {RESOLUTION_LABELS[option]}
              </option>
            ))}
        </select>
      </label>

      {resolution === "SELECT_AUTHORITATIVE" ? (
        <fieldset className="mt-3 text-sm text-ink">
          <legend>Authoritative source</legend>
          {selectable.map((item) => (
            <label key={item.id} className="mt-1 flex items-center gap-2">
              <input
                type="radio"
                name={`authoritative-${reconciliation.id}`}
                checked={selectedLineItemId === item.lineItemId}
                onChange={() => setSelectedLineItemId(item.lineItemId ?? "")}
              />
              {item.label}: {item.value ?? "—"}
              {item.currency ? ` ${item.currency}` : ""}
            </label>
          ))}
        </fieldset>
      ) : null}

      {resolution === "CORRECT_VALUE" ? (
        <label className="mt-3 block text-sm text-ink">
          Corrected value (plain number)
          <input
            className="mt-1 block w-full border border-line px-2 py-1"
            inputMode="decimal"
            maxLength={64}
            value={correctedValue}
            onChange={(event) => setCorrectedValue(event.target.value)}
          />
        </label>
      ) : null}

      <label className="mt-3 block text-sm text-ink">
        Reason
        <input
          className="mt-1 block w-full border border-line px-2 py-1"
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>

      {error ? <p className="mt-3 text-sm text-copper">{error}</p> : null}
      <button
        className="mt-3 rounded-full bg-pine px-4 py-1 text-paper disabled:opacity-50"
        type="submit"
        disabled={saving}
      >
        {saving ? "Saving…" : "Resolve conflict"}
      </button>
    </form>
  );
}

function ReconciliationsContent() {
  const { orgId } = useParams<{ orgId: string }>();
  const initialRunId = useSearchParams().get("run") ?? "";

  const [role, setRole] = useState<MembershipRole | null>(null);
  const [runs, setRuns] = useState<DiagnosticRunOption[]>([]);
  const [runId, setRunId] = useState(initialRunId);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("OPEN");
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requestRef = useRef(0);

  const canWrite = role ? roleHasPermission(role, "xray:write") : false;

  const loadPage = useCallback(async () => {
    const [nextRuns, nextRole] = await Promise.all([fetchSucceededRuns(orgId), fetchOrgRole(orgId)]);
    setRuns(nextRuns);
    setRole(nextRole);
  }, [orgId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
    void loadPage();
  }, [loadPage]);

  const loadList = useCallback(async () => {
    const request = ++requestRef.current;
    const query = new URLSearchParams({ status: statusFilter });
    if (runId) query.set("diagnosticRunId", runId);
    const { status, body } = await apiFetch<{
      reconciliations?: Reconciliation[];
      message?: string;
    }>(`/organizations/${orgId}/reconciliations?${query.toString()}`);
    if (request !== requestRef.current) return;
    setLoaded(true);
    if (status >= 400) {
      setError(apiErrorMessage(body, "Unable to load reconciliations"));
      setReconciliations([]);
      return;
    }
    setReconciliations(body.reconciliations ?? []);
    setError(null);
  }, [orgId, runId, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on filter change
    void loadList();
  }, [loadList]);

  async function onDetect() {
    if (!canWrite || !runId) return;
    setDetecting(true);
    setError(null);
    setMessage(null);
    try {
      const { status, body } = await apiFetch<{
        detected?: number;
        created?: number;
        message?: string;
      }>(`/organizations/${orgId}/reconciliations/detect`, {
        method: "POST",
        json: { diagnosticRunId: runId },
      });
      if (status >= 400) {
        setError(apiErrorMessage(body, "Unable to detect conflicts"));
        return;
      }
      setMessage(
        `${body.detected ?? 0} conflict(s) found in this run's evidence, ${
          body.created ?? 0
        } newly recorded.`,
      );
      await loadList();
    } finally {
      setDetecting(false);
    }
  }

  return (
    <>
      <SiteHeader mark="Reconciliations" />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.16em] text-pine">Opero X-Ray</p>
            <h1 className="mt-2 text-3xl text-ink">Evidence reconciliations</h1>
            <p className="mt-2 max-w-2xl text-muted">
              Places where source documents disagree. A resolution records your decision and
              reason; it does not rewrite extracted figures or completed diagnostics. Open critical
              conflicts block report publication.
            </p>
          </div>
          <Link className="text-pine underline" href={`/organizations/${orgId}`}>
            Back to organization
          </Link>
        </div>

        <section className="mb-8 grid gap-3 border border-line p-4 sm:grid-cols-2">
          <label className="text-sm text-ink">
            Diagnostic run
            <select
              className="mt-1 block w-full border border-line px-2 py-2"
              value={runId}
              onChange={(event) => {
                setRunId(event.target.value);
                setMessage(null);
              }}
            >
              <option value="">All conflicts</option>
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
          <label className="text-sm text-ink">
            Status
            <select
              className="mt-1 block w-full border border-line px-2 py-2"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {canWrite ? (
            <div className="sm:col-span-2">
              <button
                className="rounded-full border border-line px-4 py-1 text-ink disabled:opacity-50"
                type="button"
                disabled={detecting || !runId}
                onClick={() => void onDetect()}
              >
                {detecting ? "Checking…" : "Check this run for conflicts"}
              </button>
              <p className="mt-2 text-sm text-muted">
                {runId
                  ? "Compares the figures in the run's input snapshot. Existing decisions are kept."
                  : "Choose a diagnostic run to check it. Conflicts between documents are also recorded whenever readiness is assessed."}
              </p>
            </div>
          ) : null}
        </section>

        {error ? <p className="mb-4 text-sm text-copper">{error}</p> : null}
        {message ? <p className="mb-4 text-sm text-pine">{message}</p> : null}

        <ul className="space-y-4">
          {reconciliations.map((reconciliation) => (
            <li key={reconciliation.id} className="border border-line p-4">
              <p className="text-sm uppercase tracking-wide text-muted">
                {reconciliation.severity} · {reconciliation.status}
                {reconciliation.concept ? ` · ${reconciliation.concept}` : ""}
              </p>
              <h2 className="mt-1 text-lg text-ink">{reconciliation.title}</h2>
              <p className="mt-1 text-sm text-muted">{reconciliation.explanation}</p>

              <ul className="mt-3 divide-y divide-line border border-line text-sm">
                {reconciliation.items.map((item) => (
                  <li key={item.id} className="flex flex-wrap justify-between gap-3 px-3 py-2">
                    <span className="text-ink">
                      {item.label}
                      {item.periodLabel ? (
                        <span className="text-muted"> · {item.periodLabel}</span>
                      ) : null}
                      {item.isAuthoritative ? (
                        <span className="text-pine"> · authoritative</span>
                      ) : null}
                    </span>
                    <span className="text-ink">
                      {item.value ?? "—"}
                      {item.currency ? ` ${item.currency}` : ""}
                      {item.documentId ? (
                        <Link
                          className="ml-3 underline"
                          href={`/organizations/${orgId}/documents/${item.documentId}`}
                        >
                          Source
                        </Link>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>

              {reconciliation.status !== "OPEN" ? (
                <p className="mt-3 text-sm text-muted">
                  {reconciliation.resolution
                    ? RESOLUTION_LABELS[reconciliation.resolution]
                    : reconciliation.status}
                  {reconciliation.resolvedValue ? ` · value ${reconciliation.resolvedValue}` : ""}
                  {reconciliation.resolutionReason ? ` · ${reconciliation.resolutionReason}` : ""}
                  {reconciliation.resolvedAt
                    ? ` · ${new Date(reconciliation.resolvedAt).toLocaleString()}`
                    : ""}
                </p>
              ) : canWrite ? (
                <ResolveForm
                  orgId={orgId}
                  reconciliation={reconciliation}
                  onResolved={loadList}
                />
              ) : (
                <p className="mt-3 text-sm text-muted">
                  View-only access: resolving conflicts requires Analyst or higher.
                </p>
              )}
            </li>
          ))}
          {!loaded ? <li className="text-muted">Loading reconciliations…</li> : null}
          {loaded && !error && reconciliations.length === 0 ? (
            <li className="text-muted">
              {statusFilter === "OPEN"
                ? "No open evidence conflicts."
                : "No reconciliations match this filter."}
            </li>
          ) : null}
        </ul>
      </main>
    </>
  );
}

export default function ReconciliationsPage() {
  return (
    <Suspense fallback={null}>
      <ReconciliationsContent />
    </Suspense>
  );
}
