"use client";

import { membershipRoleSchema, roleHasPermission, type MembershipRole } from "@opero/shared";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { SiteHeader } from "../../../../components/site-header";
import { apiFetch } from "../../../../lib/api";

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

export default function DiagnosticsPage() {
  const params = useParams<{ orgId: string }>();
  const router = useRouter();
  const orgId = params.orgId;
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<MembershipRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canWrite = role ? roleHasPermission(role, "xray:write") : false;

  const load = useCallback(async () => {
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
      return;
    }
    const membership = orgsRes.body.organizations?.find((row) => row.organization.id === orgId);
    const parsedRole = membership ? membershipRoleSchema.safeParse(membership.role) : null;
    setRole(parsedRole?.success ? parsedRole.data : null);
    setRuns(runsRes.body.runs ?? []);
    setDocuments(
      (docsRes.body.documents ?? []).filter(
        (d) => d.scanStatus === "CLEAN" && ["READY", "REVIEW_REQUIRED"].includes(d.processingStatus),
      ),
    );
    setError(null);
  }, [orgId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
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
          json: { documentIds: selected, currency: "USD" },
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

  return (
    <>
      <SiteHeader mark="Diagnostics" />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.16em] text-pine">Opero X-Ray</p>
            <h1 className="mt-2 text-3xl text-ink">Diagnostics</h1>
            <p className="mt-2 max-w-2xl text-muted">
              Deterministic KPIs, data-quality measures, and a provisional Business Health Score from
              reviewed financial evidence. Missing data reduces coverage — it is not treated as zero.
            </p>
          </div>
          <Link className="text-pine underline" href={`/organizations/${orgId}`}>
            Back to organization
          </Link>
        </div>

        {canWrite ? (
          <form onSubmit={onStart} className="mb-10 border border-line p-4">
            <h2 className="text-lg text-ink">Start a diagnostic run</h2>
            <p className="mt-1 text-sm text-muted">
              Select clean-scanned documents. Results stay reproducible via an immutable input
              snapshot.
            </p>
            <ul className="mt-4 max-h-48 space-y-2 overflow-auto">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={selected.includes(doc.id)}
                      onChange={() => toggleDoc(doc.id)}
                    />
                    {doc.originalFilename}
                  </label>
                </li>
              ))}
              {documents.length === 0 ? (
                <li className="text-sm text-muted">
                  No eligible documents.{" "}
                  <Link className="underline" href={`/organizations/${orgId}/documents`}>
                    Upload documents
                  </Link>{" "}
                  first.
                </li>
              ) : null}
            </ul>
            <button
              className="mt-4 rounded-full bg-pine px-5 py-2 text-paper disabled:opacity-50"
              type="submit"
              disabled={submitting || selected.length === 0}
            >
              {submitting ? "Starting…" : "Run diagnostics"}
            </button>
          </form>
        ) : (
          <p className="mb-10 text-sm text-muted">
            View-only access: starting diagnostics requires Analyst or higher.
          </p>
        )}

        {error ? <p className="mb-4 text-sm text-copper">{error}</p> : null}

        <ul className="divide-y divide-line border border-line">
          {runs.map((run) => (
            <li key={run.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <Link
                  className="font-medium text-ink underline"
                  href={`/organizations/${orgId}/diagnostics/${run.id}`}
                >
                  Run {run.id.slice(0, 8)}…
                </Link>
                <p className="text-sm text-muted">
                  {run.status}
                  {run.currency ? ` · ${run.currency}` : ""}
                  {run.periodLabel ? ` · ${run.periodLabel}` : ""}
                  {run.score
                    ? run.score.status === "SCORED"
                      ? ` · score ${run.score.overallScore}`
                      : " · INSUFFICIENT_DATA"
                    : ""}
                </p>
              </div>
              <time className="text-sm text-muted">{new Date(run.createdAt).toLocaleString()}</time>
            </li>
          ))}
          {runs.length === 0 ? (
            <li className="px-4 py-6 text-muted">No diagnostic runs yet.</li>
          ) : null}
        </ul>
      </main>
    </>
  );
}
