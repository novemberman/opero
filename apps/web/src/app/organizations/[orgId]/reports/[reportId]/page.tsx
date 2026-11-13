"use client";

import { roleHasPermission, type MembershipRole } from "@opero/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { SiteHeader } from "../../../../../components/site-header";
import { apiDownload, apiErrorMessage, apiFetch } from "../../../../../lib/api";
import {
  fetchInterpretationOptions,
  fetchOrgRole,
  saveBlob,
  type InterpretationOption,
} from "../../../../../lib/xray";

type ReportModel = {
  title: string;
  orgName: string;
  period: string;
  currency: string | null;
  generatedAt: string | null;
  score: { status: string; overall: number | null; limitations: string[] };
  metrics: Array<{
    code: string;
    label: string;
    dimension: string | null;
    status: string;
    value: string | null;
    unit: string | null;
    periodLabel: string | null;
  }>;
  findings: Array<{
    id: string | null;
    category: string;
    severity: string;
    title: string;
    explanation: string;
    implication: string | null;
    suggestedAction: string | null;
  }>;
  quality: {
    completeness: string | null;
    consistency: string | null;
    evidenceReliability: string | null;
    diagnosticCoverage: string | null;
  };
  readinessStatus?: string;
  aiNarrative?: {
    isSimulated: boolean;
    summary: string;
    keyObservations: string[];
    risks: string[];
    limitations: string[];
    provider: string | null;
    model: string | null;
  };
  disclosures: string[];
  verifiedPublication: boolean;
};

type VersionSummary = {
  id: string;
  versionNumber: number;
  status: string;
  aiInterpretationVersionId: string | null;
  storageKey: string | null;
  byteSize: number | null;
  createdAt: string;
};

type Approval = {
  id: string;
  action: string;
  note: string | null;
  createdAt: string;
  reportVersionId: string;
  actor: { id: string; name: string } | null;
};

type Report = {
  id: string;
  title: string;
  status: "DRAFT" | "REVIEW_REQUIRED" | "APPROVED" | "PUBLISHED" | "REJECTED" | "SUPERSEDED";
  verifiedPublication: boolean;
  publishedAt: string | null;
  diagnosticRunId: string;
  currentVersionId: string | null;
  versions: VersionSummary[];
  approvals: Approval[];
};

type Detail = { report: Report; preview: ReportModel | null };

type ActionError = { message: string; code: string | null };

type WorkflowAction = "submit-review" | "approve" | "reject" | "publish";

const ACTION_LABELS: Record<string, string> = {
  SUBMIT_REVIEW: "Submitted for review",
  APPROVE: "Approved",
  REJECT: "Rejected",
  PUBLISH: "Published",
  SUPERSEDE: "Superseded",
};

const STATUS_TEXT: Record<Report["status"], string> = {
  DRAFT: "Draft. Submit it for review when the preview looks right.",
  REVIEW_REQUIRED: "Waiting for an Owner or Admin to approve or reject it.",
  APPROVED: "Approved. An Owner or Admin can publish it.",
  PUBLISHED: "Published. This version can no longer be changed.",
  REJECTED: "Rejected. Create a new version to continue.",
  SUPERSEDED: "Superseded.",
};

function ReportPreview({ model, draft }: { model: ReportModel; draft: boolean }) {
  const computed = model.metrics.filter((metric) => metric.status === "COMPUTED");
  const unavailable = model.metrics.filter((metric) => metric.status !== "COMPUTED");
  const quality: Array<[string, string | null]> = [
    ["Completeness", model.quality.completeness],
    ["Consistency", model.quality.consistency],
    ["Evidence reliability", model.quality.evidenceReliability],
    ["Diagnostic coverage", model.quality.diagnosticCoverage],
  ];

  return (
    <section className="mb-10 border border-line p-5">
      {model.verifiedPublication ? (
        <p className="mb-4 border border-line p-3 text-sm text-pine">
          Verified publication: the checks at publication passed (readiness not blocked, no open
          critical evidence conflicts, completed diagnostic) and a score was produced.
        </p>
      ) : (
        <p className="mb-4 border border-line p-3 text-sm text-copper">
          {draft
            ? "Draft preview — not verified. Whether a report is published as verified is decided by the checks run at publication."
            : "Not verified for publication. Read the limitations and disclosures before relying on any figure."}
        </p>
      )}

      <h2 className="text-2xl text-ink">{model.title}</h2>
      <p className="mt-1 text-muted">
        {model.orgName} · {model.period}
        {model.currency ? ` · ${model.currency}` : ""}
        {model.readinessStatus ? ` · readiness ${model.readinessStatus}` : ""}
      </p>
      {model.generatedAt ? (
        <p className="mt-1 text-sm text-muted">
          Generated {new Date(model.generatedAt).toLocaleString()}
        </p>
      ) : null}

      <h3 className="mt-6 text-lg text-ink">Business Health Score</h3>
      {model.score.overall !== null ? (
        <p className="mt-2 text-5xl text-pine">{model.score.overall}</p>
      ) : (
        <p className="mt-2 text-2xl text-copper">{model.score.status} — no score produced</p>
      )}
      {model.score.limitations.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          {model.score.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      ) : null}

      <h3 className="mt-6 text-lg text-ink">Data quality</h3>
      <p className="mt-2 text-sm text-muted">
        {quality.map(([label, value]) => `${label} ${value ?? "—"}`).join(" · ")}
      </p>

      <h3 className="mt-6 text-lg text-ink">Metrics</h3>
      <ul className="mt-2 divide-y divide-line border border-line">
        {computed.map((metric) => (
          <li
            key={`${metric.code}-${metric.periodLabel ?? ""}`}
            className="flex justify-between gap-3 px-4 py-2 text-sm"
          >
            <span className="text-ink">
              {metric.label}
              {metric.dimension ? <span className="text-muted"> ({metric.dimension})</span> : null}
            </span>
            <span className="text-ink">
              {metric.value}
              {metric.unit && metric.unit !== "ratio" ? ` ${metric.unit}` : ""}
            </span>
          </li>
        ))}
        {computed.length === 0 ? (
          <li className="px-4 py-3 text-sm text-muted">No metric could be computed.</li>
        ) : null}
      </ul>
      {unavailable.length > 0 ? (
        <p className="mt-2 text-sm text-muted">
          Not computed: {unavailable.map((metric) => `${metric.label} (${metric.status})`).join(", ")}
        </p>
      ) : null}

      <h3 className="mt-6 text-lg text-ink">Findings</h3>
      <ul className="mt-2 space-y-3">
        {model.findings.map((finding, index) => (
          <li key={finding.id ?? `${index}-${finding.title}`} className="border border-line p-3">
            <p className="text-sm uppercase tracking-wide text-muted">
              {finding.category} · {finding.severity}
            </p>
            <p className="mt-1 text-ink">{finding.title}</p>
            <p className="mt-1 text-sm text-muted">{finding.explanation}</p>
            {finding.implication ? (
              <p className="mt-1 text-sm text-ink">{finding.implication}</p>
            ) : null}
            {finding.suggestedAction ? (
              <p className="mt-1 text-sm text-pine">{finding.suggestedAction}</p>
            ) : null}
          </li>
        ))}
        {model.findings.length === 0 ? (
          <li className="text-sm text-muted">The diagnostic produced no findings.</li>
        ) : null}
      </ul>

      {model.aiNarrative ? (
        <>
          <h3 className="mt-6 text-lg text-ink">Interpretation</h3>
          <p className={`mt-1 text-sm ${model.aiNarrative.isSimulated ? "text-copper" : "text-muted"}`}>
            {model.aiNarrative.isSimulated
              ? "Simulated — assembled by fixed rules, not written by a live AI model."
              : `AI-generated${model.aiNarrative.provider ? ` (${model.aiNarrative.provider})` : ""}; the diagnostic tables take precedence.`}
          </p>
          <p className="mt-2 whitespace-pre-line text-ink">{model.aiNarrative.summary}</p>
          {(
            [
              ["Key observations", model.aiNarrative.keyObservations],
              ["Risks", model.aiNarrative.risks],
              ["Limitations", model.aiNarrative.limitations],
            ] as const
          ).map(([heading, items]) =>
            items.length > 0 ? (
              <div key={heading}>
                <h4 className="mt-3 text-base text-ink">{heading}</h4>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                  {items.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </>
      ) : null}

      <h3 className="mt-6 text-lg text-ink">Limitations and disclosures</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        {model.disclosures.map((disclosure) => (
          <li key={disclosure}>{disclosure}</li>
        ))}
      </ul>
    </section>
  );
}

export default function ReportDetailPage() {
  const { orgId, reportId } = useParams<{ orgId: string; reportId: string }>();
  const path = `/organizations/${orgId}/reports/${reportId}`;

  const [detail, setDetail] = useState<Detail | null>(null);
  const [role, setRole] = useState<MembershipRole | null>(null);
  const [interpretations, setInterpretations] = useState<InterpretationOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAi, setNewAi] = useState("keep");
  const [older, setOlder] = useState<{ versionNumber: number; model: ReportModel } | null>(null);
  const [missingPdf, setMissingPdf] = useState<string | null>(null);

  const canWrite = role ? roleHasPermission(role, "xray:write") : false;
  const canPublish = role ? roleHasPermission(role, "xray:publish") : false;

  const load = useCallback(async () => {
    const [detailRes, nextRole] = await Promise.all([
      apiFetch<Detail & { message?: string }>(path),
      fetchOrgRole(orgId),
    ]);
    setRole(nextRole);
    if (detailRes.status >= 400 || !detailRes.body.report) {
      setLoadError(apiErrorMessage(detailRes.body, "Unable to load the report"));
      return;
    }
    setDetail(detailRes.body);
    setNewTitle(detailRes.body.report.title);
    setLoadError(null);
    setInterpretations(
      await fetchInterpretationOptions(orgId, detailRes.body.report.diagnosticRunId),
    );
  }, [orgId, path]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
    void load();
  }, [load]);

  function applyResult(body: Detail, text: string) {
    setDetail(body);
    setNewTitle(body.report.title);
    setNewAi("keep");
    setNote("");
    setOlder(null);
    setMessage(text);
  }

  async function runAction(action: WorkflowAction, done: string) {
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      const { status, body } = await apiFetch<Detail & { message?: string; code?: string }>(
        `${path}/${action}`,
        { method: "POST", json: note.trim() ? { note: note.trim() } : {} },
      );
      if (status >= 400 || !body.report) {
        setActionError({
          message: apiErrorMessage(body, "The action could not be completed"),
          code: body?.code ?? null,
        });
        return;
      }
      applyResult(body, done);
    } finally {
      setBusy(false);
    }
  }

  async function onCreateVersion(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      const title = newTitle.trim();
      const { status, body } = await apiFetch<Detail & { message?: string; code?: string }>(
        `${path}/versions`,
        {
          method: "POST",
          json: {
            ...(title && title !== detail.report.title ? { title } : {}),
            ...(newAi === "keep"
              ? {}
              : { aiInterpretationVersionId: newAi === "none" ? null : newAi }),
          },
        },
      );
      if (status >= 400 || !body.report) {
        setActionError({
          message: apiErrorMessage(body, "Unable to create a new version"),
          code: body?.code ?? null,
        });
        return;
      }
      applyResult(body, "New draft version created.");
    } finally {
      setBusy(false);
    }
  }

  async function onDownload(version: VersionSummary) {
    setActionError(null);
    setMessage(null);
    setMissingPdf(null);
    const result = await apiDownload(`${path}/pdf?versionId=${version.id}`);
    if (!result.blob) {
      setActionError({
        message: result.message ?? "Unable to download the PDF",
        code: null,
      });
      if (result.status === 404 || result.status === 409) setMissingPdf(version.id);
      return;
    }
    saveBlob(result.blob, `opero-xray-report-v${version.versionNumber}.pdf`);
  }

  function onRegenerate() {
    setActionError({
      message:
        "Published PDFs are immutable. Create a new report version and publish it to replace a missing or corrupt file.",
      code: "PUBLISHED_PDF_IMMUTABLE",
    });
  }

  async function onPreviewVersion(version: VersionSummary) {
    setActionError(null);
    const { status, body } = await apiFetch<{ preview?: ReportModel; message?: string }>(
      `${path}/versions/${version.id}`,
    );
    if (status >= 400 || !body.preview) {
      setActionError({
        message: apiErrorMessage(body, "Unable to load that version"),
        code: null,
      });
      return;
    }
    setOlder({ versionNumber: version.versionNumber, model: body.preview });
  }

  const report = detail?.report ?? null;
  const current = report?.versions.find((version) => version.id === report.currentVersionId);
  const shown = older?.model ?? detail?.preview ?? null;
  const unscored = detail?.preview ? detail.preview.score.overall === null : false;
  const canRevise =
    canWrite && report ? ["DRAFT", "REJECTED", "PUBLISHED"].includes(report.status) : false;
  const versionNumbers = new Map(
    (report?.versions ?? []).map((version) => [version.id, version.versionNumber]),
  );
  const fieldClass = "mt-1 block w-full border border-line px-2 py-1";

  return (
    <>
      <SiteHeader mark="Report" />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.16em] text-pine">Opero X-Ray</p>
            <h1 className="mt-2 text-3xl text-ink">{report?.title ?? "Report"}</h1>
            <p className="mt-2 text-muted">
              Status {report?.status ?? "…"}
              {current ? ` · version ${current.versionNumber}` : ""}
            </p>
          </div>
          <Link className="text-pine underline" href={`/organizations/${orgId}/reports`}>
            All reports
          </Link>
        </div>

        {loadError ? <p className="mb-4 text-sm text-copper">{loadError}</p> : null}
        {!detail && !loadError ? <p className="text-muted">Loading report…</p> : null}

        {report ? (
          <section className="mb-8 border border-line p-4">
            <h2 className="text-lg text-ink">Review and publication</h2>
            <p className="mt-1 text-sm text-muted">{STATUS_TEXT[report.status]}</p>
            {unscored && report.status !== "PUBLISHED" ? (
              <p className="mt-1 text-sm text-copper">
                The diagnostic produced no score, so this report can only be published as
                non-verified, with its limitations stated up front.
              </p>
            ) : null}
            {report.status !== "PUBLISHED" && report.publishedAt ? (
              <p className="mt-1 text-sm text-muted">
                An earlier version is published and stays available below until this one is
                published.
              </p>
            ) : null}

            {["DRAFT", "REVIEW_REQUIRED", "APPROVED"].includes(report.status) &&
            (canWrite || canPublish) ? (
              <label className="mt-3 block text-sm text-ink">
                Note for the history (optional)
                <input
                  className={fieldClass}
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {report.status === "DRAFT" && canWrite ? (
                <button
                  className="rounded-full bg-pine px-4 py-1 text-paper disabled:opacity-50"
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction("submit-review", "Submitted for review.")}
                >
                  Submit for review
                </button>
              ) : null}
              {report.status === "REVIEW_REQUIRED" && canPublish ? (
                <button
                  className="rounded-full bg-pine px-4 py-1 text-paper disabled:opacity-50"
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction("approve", "Report approved.")}
                >
                  Approve
                </button>
              ) : null}
              {report.status === "APPROVED" && canPublish ? (
                <button
                  className="rounded-full bg-pine px-4 py-1 text-paper disabled:opacity-50"
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction("publish", "Report published.")}
                >
                  {busy ? "Working…" : "Publish"}
                </button>
              ) : null}
              {(report.status === "REVIEW_REQUIRED" || report.status === "APPROVED") &&
              canPublish ? (
                <button
                  className="rounded-full border border-line px-4 py-1 text-ink disabled:opacity-50"
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction("reject", "Report rejected.")}
                >
                  Reject
                </button>
              ) : null}
            </div>

            {(report.status === "REVIEW_REQUIRED" || report.status === "APPROVED") &&
            !canPublish ? (
              <p className="mt-3 text-sm text-muted">
                Approving, rejecting and publishing require an Owner or Admin.
              </p>
            ) : null}
            {report.status === "DRAFT" && role && !canWrite ? (
              <p className="mt-3 text-sm text-muted">
                View-only access: submitting for review requires Analyst or higher.
              </p>
            ) : null}

            {actionError ? (
              <div className="mt-3 text-sm text-copper">
                <p>{actionError.message}</p>
                {actionError.code === "CRITICAL_RECONCILIATIONS_OPEN" ? (
                  <Link
                    className="underline"
                    href={`/organizations/${orgId}/reconciliations?run=${report.diagnosticRunId}`}
                  >
                    Resolve evidence conflicts
                  </Link>
                ) : null}
                {actionError.code === "READINESS_BLOCKED" ? (
                  <Link
                    className="underline"
                    href={`/organizations/${orgId}/readiness?run=${report.diagnosticRunId}`}
                  >
                    Open the readiness checklist
                  </Link>
                ) : null}
              </div>
            ) : null}
            {message ? <p className="mt-3 text-sm text-pine">{message}</p> : null}
          </section>
        ) : null}

        {older ? (
          <p className="mb-3 text-sm text-muted">
            Showing version {older.versionNumber}.{" "}
            <button className="underline" type="button" onClick={() => setOlder(null)}>
              Back to the current version
            </button>
          </p>
        ) : null}
        {report && shown ? (
          <ReportPreview
            model={shown}
            draft={older ? shown.generatedAt === null : report.status !== "PUBLISHED"}
          />
        ) : null}

        {report ? (
          <section className="mb-10">
            <h2 className="text-xl text-ink">Versions</h2>
            <ul className="mt-3 divide-y divide-line border border-line">
              {report.versions.map((version) => (
                <li
                  key={version.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="text-ink">
                      Version {version.versionNumber} · {version.status}
                      {version.id === report.currentVersionId ? " · current" : ""}
                    </p>
                    <p className="text-sm text-muted">
                      Created {new Date(version.createdAt).toLocaleString()}
                      {version.aiInterpretationVersionId ? " · with AI interpretation" : ""}
                      {version.byteSize ? ` · PDF ${Math.ceil(version.byteSize / 1024)} KB` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {version.id !== report.currentVersionId ? (
                      <button
                        className="underline"
                        type="button"
                        onClick={() => void onPreviewVersion(version)}
                      >
                        View
                      </button>
                    ) : null}
                    {version.storageKey ? (
                      <button
                        className="text-pine underline"
                        type="button"
                        onClick={() => void onDownload(version)}
                      >
                        Download PDF
                      </button>
                    ) : null}
                    {missingPdf === version.id && canPublish ? (
                      <button
                        className="underline"
                        type="button"
                        onClick={() => onRegenerate()}
                      >
                        Published PDF is immutable — create a new version
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {!report.versions.some((version) => version.storageKey) ? (
              <p className="mt-2 text-sm text-muted">
                A PDF is produced when the report is published.
              </p>
            ) : null}
          </section>
        ) : null}

        {report && canRevise ? (
          <form className="mb-10 border border-line p-4" onSubmit={onCreateVersion}>
            <h2 className="text-lg text-ink">Create a new version</h2>
            <p className="mt-1 text-sm text-muted">
              {report.status === "PUBLISHED"
                ? "The published version stays as it is and remains downloadable; it is marked superseded once the new version is published."
                : "The current draft is replaced by a new one built from the same diagnostic."}{" "}
              Readiness is assessed again.
            </p>
            <label className="mt-3 block text-sm text-ink">
              Title
              <input
                className={fieldClass}
                maxLength={200}
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
              />
            </label>
            <label className="mt-3 block text-sm text-ink">
              AI interpretation
              <select
                className={fieldClass}
                value={newAi}
                onChange={(event) => setNewAi(event.target.value)}
              >
                <option value="keep">
                  {current?.aiInterpretationVersionId
                    ? "Keep the attached interpretation (uses its current text)"
                    : "None"}
                </option>
                {current?.aiInterpretationVersionId ? (
                  <option value="none">Remove the interpretation</option>
                ) : null}
                {interpretations
                  .filter((option) => option.versionId !== current?.aiInterpretationVersionId)
                  .map((option) => (
                    <option key={option.versionId} value={option.versionId}>
                      {option.label}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="mt-3 rounded-full border border-line px-4 py-1 text-ink disabled:opacity-50"
              type="submit"
              disabled={busy}
            >
              Create new version
            </button>
          </form>
        ) : null}

        {report ? (
          <section className="mb-10">
            <h2 className="text-xl text-ink">Approval history</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {report.approvals.map((approval) => (
                <li key={approval.id} className="border-l border-line pl-3">
                  <p className="text-ink">
                    {ACTION_LABELS[approval.action] ?? approval.action}
                    {versionNumbers.has(approval.reportVersionId)
                      ? ` · version ${versionNumbers.get(approval.reportVersionId)}`
                      : ""}
                  </p>
                  <p className="text-muted">
                    {approval.actor?.name ?? "Unknown user"} ·{" "}
                    {new Date(approval.createdAt).toLocaleString()}
                    {approval.note ? ` · ${approval.note}` : ""}
                  </p>
                </li>
              ))}
              {report.approvals.length === 0 ? (
                <li className="text-muted">No review activity yet.</li>
              ) : null}
            </ul>
          </section>
        ) : null}

        {report ? (
          <section className="border border-line p-4 text-sm text-muted">
            <h2 className="text-base text-ink">Related</h2>
            <p className="mt-2">
              <Link
                className="mr-4 underline"
                href={`/organizations/${orgId}/diagnostics/${report.diagnosticRunId}`}
              >
                Diagnostic run
              </Link>
              <Link
                className="mr-4 underline"
                href={`/organizations/${orgId}/readiness?run=${report.diagnosticRunId}`}
              >
                Readiness
              </Link>
              <Link
                className="underline"
                href={`/organizations/${orgId}/reconciliations?run=${report.diagnosticRunId}`}
              >
                Reconciliations
              </Link>
            </p>
          </section>
        ) : null}
      </main>
    </>
  );
}
