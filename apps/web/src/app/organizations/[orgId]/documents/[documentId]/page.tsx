"use client";

import {
  membershipRoleSchema,
  roleHasPermission,
  type DocumentProcessingProgress,
  type MembershipRole,
} from "@opero/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProcessingTimeline } from "../../../../../components/processing-timeline";
import { StatementMetadataPanel } from "../../../../../components/statement-metadata";
import { apiFetch } from "../../../../../lib/api";

type Evidence = {
  evidenceKey: string;
  pageNumber?: number | null;
  sheetName?: string | null;
  cellRef?: string | null;
  rowIndex?: number | null;
  columnIndex?: number | null;
  snippet?: string | null;
};

type LineItem = {
  id: string;
  concept: string;
  labelRaw: string;
  rawValue: string;
  /** Numeric parse in statement units (no scale multiplier). */
  normalizedValue: string | null;
  /** Absolute monetary amount after unit scale (null for non-monetary). */
  actualMonetaryValue?: string | null;
  currency?: string | null;
  quantityClass?: string;
  unitScale?: string;
  scaleConfidence?: string;
  unitScaleRequiresReview?: boolean;
  quality: string;
  reviewStatus: string;
  evidence: Evidence | null;
};

type Extraction = {
  id: string;
  method: string;
  quality: string;
  warnings: string[] | null;
  statements: Array<{
    id: string;
    statementType: string;
    lineItems: LineItem[];
  }>;
};

type StatusPayload = {
  processingStatus?: string;
  scanStatus?: string;
  extractionStatus?: string;
  failureMessage?: string | null;
  progress?: DocumentProcessingProgress;
  message?: string;
};

const TERMINAL = new Set(["READY", "REVIEW_REQUIRED", "REJECTED", "FAILED"]);

export default function DocumentDetailPage() {
  const params = useParams<{ orgId: string; documentId: string }>();
  const { orgId, documentId } = params;
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [role, setRole] = useState<MembershipRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const delayRef = useRef(2000);

  const canWrite = role ? roleHasPermission(role, "xray:write") : false;

  const load = useCallback(async () => {
    const [statusRes, extractionRes, orgsRes] = await Promise.all([
      apiFetch<StatusPayload>(`/organizations/${orgId}/documents/${documentId}/status`),
      apiFetch<{ extractions?: Extraction[]; message?: string }>(
        `/organizations/${orgId}/documents/${documentId}/extractions`,
      ),
      apiFetch<{
        organizations?: Array<{ role: string; organization: { id: string } }>;
        message?: string;
      }>("/organizations"),
    ]);
    if (statusRes.status >= 400) {
      setError(statusRes.body.message ?? "Failed to load document status");
      delayRef.current = Math.min(delayRef.current * 2, 15_000);
      return false;
    }
    if (extractionRes.status >= 400 && extractionRes.status !== 403) {
      // Extractions may be forbidden until clean scan; keep polling status.
      setExtractions([]);
    } else {
      setExtractions(extractionRes.body.extractions ?? []);
    }
    const membership = orgsRes.body.organizations?.find((row) => row.organization.id === orgId);
    const parsedRole = membership ? membershipRoleSchema.safeParse(membership.role) : null;
    setRole(parsedRole?.success ? parsedRole.data : null);
    setStatus(statusRes.body);
    setError(null);
    delayRef.current = 2000;
    return TERMINAL.has(String(statusRes.body.processingStatus));
  }, [orgId, documentId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const done = await load();
      if (cancelled) return;
      setNow(Date.now());
      if (!done) {
        timer = setTimeout(() => void tick(), delayRef.current);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  async function onReview(event: FormEvent<HTMLFormElement>, lineItemId: string) {
    event.preventDefault();
    if (!canWrite) return;
    const form = new FormData(event.currentTarget);
    const action = String(form.get("action") ?? "CONFIRM");
    const newValue = String(form.get("newValue") ?? "");
    const reason = String(form.get("reason") ?? "");
    const { status: httpStatus, body } = await apiFetch<{ message?: string }>(
      `/organizations/${orgId}/documents/${documentId}/review`,
      {
        method: "POST",
        json: {
          lineItemId,
          action,
          newValue: action === "CORRECT" ? newValue : undefined,
          reason: reason || undefined,
        },
      },
    );
    if (httpStatus >= 400) {
      setError(body.message ?? "Review failed");
      return;
    }
    setMessage("Review saved — original raw evidence preserved");
    await load();
  }

  const statements = extractions.flatMap((extraction) => extraction.statements);
  const lines = statements.flatMap((statement) => statement.lineItems);
  const warnings = extractions.flatMap((e) =>
    Array.isArray(e.warnings) ? e.warnings : [],
  );

  const priorityLines = useMemo(() => {
    return [...lines].sort((a, b) => {
      const score = (line: LineItem) => {
        let s = 0;
        if (line.unitScaleRequiresReview) s += 40;
        if (line.reviewStatus === "PENDING") s += 20;
        if (line.quality === "LOW" || line.quality === "MANUAL") s += 15;
        if (line.quantityClass && line.quantityClass !== "MONETARY") s += 5;
        return s;
      };
      return score(b) - score(a);
    });
  }, [lines]);

  const elapsedLabel = `Elapsed ${Math.max(0, Math.round((now - startedAt) / 1000))}s`;
  const processingStatus = String(status?.processingStatus ?? "");
  const readyForDiagnostics = processingStatus === "READY";
  const needsReview = processingStatus === "REVIEW_REQUIRED";

  return (
    <>
      <div className="mx-auto max-w-6xl py-10">
        <Link className="text-pine underline" href={`/organizations/${orgId}/documents`}>
          All documents
        </Link>
        <h1 className="mt-4 text-3xl text-ink">Document processing</h1>
        <p className="mt-2 text-muted">
          Extracted figures retain source evidence. Corrections keep the original raw value. Processing
          continues if you leave this page.
        </p>

        {status?.progress ? (
          <div className="mt-6">
            <ProcessingTimeline progress={status.progress} elapsedLabel={elapsedLabel} />
          </div>
        ) : status ? (
          <p className="mt-4 text-sm text-muted">
            Status: {String(status.processingStatus)} · scan {String(status.scanStatus)} · extract{" "}
            {String(status.extractionStatus)}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-ink no-underline"
            href={`#extracted-figures`}
          >
            View extraction
          </Link>
          {readyForDiagnostics || needsReview ? (
            <Link
              className="inline-flex min-h-10 items-center rounded-full bg-pine px-4 text-paper no-underline"
              href={`/organizations/${orgId}/readiness`}
            >
              {needsReview ? "Continue to readiness / review" : "Continue to diagnostics"}
            </Link>
          ) : null}
        </div>

        {error ? <p className="mt-4 text-sm text-copper">{error}</p> : null}
        {message ? <p className="mt-4 text-sm text-pine">{message}</p> : null}
        {status?.failureMessage ? (
          <p className="mt-4 text-sm text-copper">{status.failureMessage}</p>
        ) : null}

        {warnings.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-xl text-ink">Extraction notes</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              {warnings.slice(0, 12).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {statements.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-xl text-ink">Statement metadata</h2>
            <p className="mt-1 text-sm text-muted">
              Period, currency and entity details feed the{" "}
              <Link className="underline" href={`/organizations/${orgId}/readiness`}>
                readiness assessment
              </Link>
              . Every correction and confirmation is kept in the history.
            </p>
            <ul className="mt-3 space-y-4">
              {statements.map((statement) => (
                <StatementMetadataPanel
                  key={statement.id}
                  orgId={orgId}
                  statementId={statement.id}
                  statementType={statement.statementType}
                  canWrite={canWrite}
                />
              ))}
            </ul>
          </section>
        ) : null}

        <h2 id="extracted-figures" className="mt-8 text-xl text-ink">
          Extracted figures
        </h2>
        <p className="mt-1 text-sm text-muted">
          Prioritized by materiality and uncertainty. Percentages and ratios are kept separate from
          monetary concepts.
        </p>
        <ul className="mt-3 space-y-6">
          {priorityLines.map((line) => (
            <li key={line.id} className="border border-line p-4">
              <p className="text-lg text-ink">{line.labelRaw}</p>
              <p className="text-sm text-muted">
                Concept {line.concept}
                {line.quantityClass ? ` · ${line.quantityClass}` : ""} · raw {line.rawValue}
                {line.unitScale ? ` · scale ${line.unitScale}` : ""}
                {line.unitScaleRequiresReview ? " · scale needs confirmation" : ""} · statement units{" "}
                {line.normalizedValue ?? "—"}
                {line.quantityClass === "MONETARY" || !line.quantityClass
                  ? ` · actual ${line.currency ?? "amount"} ${line.actualMonetaryValue ?? "—"}`
                  : ""}{" "}
                · {line.quality} · {line.reviewStatus}
              </p>
              {line.evidence ? (
                <p className="mt-2 text-sm text-muted">
                  Evidence {line.evidence.evidenceKey.slice(0, 8)}…
                  {line.evidence.pageNumber != null ? ` · page ${line.evidence.pageNumber}` : ""}
                  {line.evidence.sheetName ? ` · sheet ${line.evidence.sheetName}` : ""}
                  {line.evidence.cellRef ? ` · cell ${line.evidence.cellRef}` : ""}
                  {line.evidence.rowIndex != null ? ` · row ${line.evidence.rowIndex}` : ""}
                  {line.evidence.snippet ? ` · ${line.evidence.snippet}` : ""}
                </p>
              ) : null}
              {canWrite ? (
                <form
                  className="mt-4 flex flex-wrap gap-2"
                  onSubmit={(event) => onReview(event, line.id)}
                >
                  <select
                    name="action"
                    className="border border-line px-2 py-1"
                    defaultValue="CONFIRM"
                  >
                    <option value="CONFIRM">Confirm</option>
                    <option value="CORRECT">Correct</option>
                    <option value="REJECT">Reject</option>
                  </select>
                  <input
                    name="newValue"
                    className="border border-line px-2 py-1"
                    placeholder="Corrected value"
                  />
                  <input
                    name="reason"
                    className="border border-line px-2 py-1"
                    placeholder="Reason"
                  />
                  <button className="rounded-full bg-pine px-4 py-1 text-paper" type="submit">
                    Save review
                  </button>
                </form>
              ) : null}
            </li>
          ))}
          {lines.length === 0 ? (
            <li className="text-muted">No extracted figures yet. Processing may still be running.</li>
          ) : null}
        </ul>
      </div>
    </>
  );
}
