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
import { ExtractionReviewBoard } from "../../../../../components/extraction-review-board";
import type { ExtractionLine } from "../../../../../components/extraction-line-card";
import { ProcessingTimeline } from "../../../../../components/processing-timeline";
import { StatementMetadataPanel } from "../../../../../components/statement-metadata";
import { Alert, Badge, buttonClassName } from "../../../../../components/ui";
import { apiFetch } from "../../../../../lib/api";

type Extraction = {
  id: string;
  method: string;
  quality: string;
  warnings: string[] | null;
  statements: Array<{
    id: string;
    statementType: string;
    lineItems: ExtractionLine[];
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
  const lines = useMemo(
    () =>
      extractions.flatMap((extraction) =>
        extraction.statements.flatMap((statement) => statement.lineItems),
      ),
    [extractions],
  );
  const warnings = extractions.flatMap((e) => (Array.isArray(e.warnings) ? e.warnings : []));

  const elapsedLabel = `Elapsed ${Math.max(0, Math.round((now - startedAt) / 1000))}s`;
  const processingStatus = String(status?.processingStatus ?? "");
  const readyForDiagnostics = processingStatus === "READY";
  const needsReview = processingStatus === "REVIEW_REQUIRED";

  return (
    <div className="mx-auto max-w-6xl space-y-8" data-testid="document-detail">
      <header className="space-y-3">
        <Link
          className="text-sm font-medium text-navy no-underline hover:text-emerald"
          href={`/organizations/${orgId}/documents`}
        >
          ← All documents
        </Link>
        <p className="brand-kicker">Opero X-Ray</p>
        <h1 className="mt-2 text-3xl text-navy">Document processing</h1>
        <p className="max-w-2xl text-sm text-text-secondary">
          Extracted figures retain source evidence. Corrections update statement units while
          preserving the original raw value. Processing continues if you leave this page.
        </p>
        <div className="flex flex-wrap gap-2">
          {status?.processingStatus ? (
            <Badge tone="info">{status.processingStatus}</Badge>
          ) : null}
          {status?.scanStatus ? <Badge tone="neutral">scan {status.scanStatus}</Badge> : null}
          {status?.extractionStatus ? (
            <Badge tone="neutral">extract {status.extractionStatus}</Badge>
          ) : null}
        </div>
      </header>

      {status?.progress ? (
        <ProcessingTimeline progress={status.progress} elapsedLabel={elapsedLabel} />
      ) : status ? (
        <Alert tone="info" title="Status">
          {String(status.processingStatus)} · scan {String(status.scanStatus)} · extract{" "}
          {String(status.extractionStatus)}
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <a href="#extracted-figures" className={buttonClassName({ variant: "secondary" })}>
          View extraction
        </a>
        {readyForDiagnostics || needsReview ? (
          <Link
            className={buttonClassName()}
            href={`/organizations/${orgId}/readiness`}
          >
            {needsReview ? "Continue to readiness / review" : "Continue to diagnostics"}
          </Link>
        ) : null}
      </div>

      {error ? (
        <Alert tone="error" title="Something went wrong">
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert tone="success" title="Saved">
          {message}
        </Alert>
      ) : null}
      {status?.failureMessage ? (
        <Alert tone="error" title="Processing failure">
          {status.failureMessage}
        </Alert>
      ) : null}

      {warnings.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold text-navy">Extraction notes</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-secondary">
            {warnings.slice(0, 12).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {statements.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold text-navy">Statement metadata</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Period, currency and entity details feed{" "}
            <Link className="text-emerald underline" href={`/organizations/${orgId}/readiness`}>
              readiness
            </Link>
            . Corrections remain in review history.
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

      <ExtractionReviewBoard lines={lines} canWrite={canWrite} onReview={onReview} />
    </div>
  );
}
