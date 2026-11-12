"use client";

import { membershipRoleSchema, roleHasPermission, type MembershipRole } from "@opero/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { SiteHeader } from "../../../../../components/site-header";
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
  normalizedValue: string | null;
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

export default function DocumentDetailPage() {
  const params = useParams<{ orgId: string; documentId: string }>();
  const { orgId, documentId } = params;
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [role, setRole] = useState<MembershipRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canWrite = role ? roleHasPermission(role, "xray:write") : false;

  const load = useCallback(async () => {
    const [statusRes, extractionRes, orgsRes] = await Promise.all([
      apiFetch<Record<string, unknown> & { message?: string }>(
        `/organizations/${orgId}/documents/${documentId}/status`,
      ),
      apiFetch<{ extractions?: Extraction[]; message?: string }>(
        `/organizations/${orgId}/documents/${documentId}/extractions`,
      ),
      apiFetch<{
        organizations?: Array<{ role: string; organization: { id: string } }>;
        message?: string;
      }>("/organizations"),
    ]);
    if (statusRes.status >= 400 || extractionRes.status >= 400) {
      setError(statusRes.body.message ?? extractionRes.body.message ?? "Failed to load document");
      return;
    }
    const membership = orgsRes.body.organizations?.find((row) => row.organization.id === orgId);
    const parsedRole = membership ? membershipRoleSchema.safeParse(membership.role) : null;
    setRole(parsedRole?.success ? parsedRole.data : null);
    setStatus(statusRes.body);
    setExtractions(extractionRes.body.extractions ?? []);
    setError(null);
  }, [orgId, documentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount + poll fetch
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
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
    setMessage("Review saved");
    await load();
  }

  const lines = extractions.flatMap((extraction) =>
    extraction.statements.flatMap((statement) => statement.lineItems),
  );

  return (
    <>
      <SiteHeader mark="Review" />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <Link className="text-pine underline" href={`/organizations/${orgId}/documents`}>
          All documents
        </Link>
        <h1 className="mt-4 text-3xl text-ink">Extraction review</h1>
        <p className="mt-2 text-muted">
          Extracted figures retain source evidence. Corrections keep the original raw value.
        </p>

        {status ? (
          <p className="mt-4 text-sm text-muted">
            Status: {String(status.processingStatus)} · scan {String(status.scanStatus)} · extract{" "}
            {String(status.extractionStatus)}
          </p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-copper">{error}</p> : null}
        {message ? <p className="mt-4 text-sm text-pine">{message}</p> : null}

        <ul className="mt-8 space-y-6">
          {lines.map((line) => (
            <li key={line.id} className="border border-line p-4">
              <p className="text-lg text-ink">{line.labelRaw}</p>
              <p className="text-sm text-muted">
                Concept {line.concept} · raw {line.rawValue} · normalized {line.normalizedValue ?? "—"} ·{" "}
                {line.quality} · {line.reviewStatus}
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
      </main>
    </>
  );
}
