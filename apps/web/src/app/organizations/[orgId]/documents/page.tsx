"use client";

import { membershipRoleSchema, roleHasPermission, type MembershipRole } from "@opero/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DocumentUploadForm } from "../../../../components/document-upload-form";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  buttonClassName,
} from "../../../../components/ui";
import { apiFetch } from "../../../../lib/api";
import {
  documentStatusLabel,
  documentStatusTone,
} from "../../../../lib/document-status-labels";

type DocumentRow = {
  id: string;
  originalFilename: string;
  format: string;
  processingStatus: string;
  scanStatus: string;
  extractionStatus: string;
  uploadedAt: string;
  byteSize?: number;
  failureClass?: string | null;
};

function StatusBadge({
  kind,
  status,
  prefix,
}: {
  kind: "processing" | "scan" | "extraction";
  status: string;
  prefix?: string;
}) {
  const label = documentStatusLabel(kind, status);
  const text = prefix ? `${prefix}: ${label}` : label;
  return (
    <Badge
      tone={documentStatusTone(status)}
      title={`${kind} status: ${status}`}
      data-status={status}
      className="max-w-full truncate"
    >
      <span className="truncate">{text}</span>
    </Badge>
  );
}

export default function DocumentsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [role, setRole] = useState<MembershipRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [formatFilter, setFormatFilter] = useState("ALL");

  const canWrite = role ? roleHasPermission(role, "xray:write") : false;

  const load = useCallback(async () => {
    setLoading(true);
    const [docsRes, orgsRes] = await Promise.all([
      apiFetch<{ documents?: DocumentRow[]; message?: string }>(`/organizations/${orgId}/documents`),
      apiFetch<{
        organizations?: Array<{ role: string; organization: { id: string } }>;
        message?: string;
      }>("/organizations"),
    ]);
    if (docsRes.status >= 400) {
      setError(docsRes.body.message ?? "Unable to load documents");
      setLoading(false);
      return;
    }
    const membership = orgsRes.body.organizations?.find((row) => row.organization.id === orgId);
    const parsedRole = membership ? membershipRoleSchema.safeParse(membership.role) : null;
    setRole(parsedRole?.success ? parsedRole.data : null);
    setDocuments(docsRes.body.documents ?? []);
    setError(null);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((doc) => {
      if (statusFilter !== "ALL" && doc.processingStatus !== statusFilter) return false;
      if (formatFilter !== "ALL" && doc.format !== formatFilter) return false;
      if (!q) return true;
      return doc.originalFilename.toLowerCase().includes(q);
    });
  }, [documents, query, statusFilter, formatFilter]);

  const statusOptions = useMemo(() => {
    const set = new Set(documents.map((d) => d.processingStatus));
    return Array.from(set).sort();
  }, [documents]);

  const existingFilenames = useMemo(
    () => documents.map((doc) => doc.originalFilename),
    [documents],
  );

  function focusUpload() {
    const el = document.getElementById("document-upload");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    const choose = el?.querySelector<HTMLButtonElement>("button");
    choose?.focus();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8" data-testid="documents-library">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald">
            Opero X-Ray
          </p>
          <h1 className="mt-2 text-3xl text-navy">Documents</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Upload statements, track scanning and extraction, then confirm figures before
            diagnostics. Reporting period metadata appears after extraction when available on the
            document detail view.
          </p>
        </div>
      </header>

      {canWrite ? (
        <DocumentUploadForm
          orgId={orgId}
          existingFilenames={existingFilenames}
          onUploaded={load}
        />
      ) : (
        <Alert tone="info" title="View-only access">
          Uploads require Analyst or higher.
        </Alert>
      )}

      <section className="space-y-4" aria-labelledby="library-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="library-heading" className="text-lg font-semibold text-navy">
            Library
          </h2>
          <p className="text-sm text-text-secondary">
            {filtered.length} of {documents.length} document{documents.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem]">
          <Input
            label="Search filename"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name"
          />
          <Select
            label="Processing status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="ALL">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {documentStatusLabel("processing", status)}
              </option>
            ))}
          </Select>
          <Select
            label="Format"
            value={formatFilter}
            onChange={(event) => setFormatFilter(event.target.value)}
          >
            <option value="ALL">All formats</option>
            <option value="PDF">PDF</option>
            <option value="XLSX">XLSX</option>
            <option value="CSV">CSV</option>
          </Select>
        </div>

        {error ? (
          <Alert tone="error" title="Unable to load documents">
            <div className="space-y-3">
              <p>{error}</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </Alert>
        ) : null}

        {loading ? (
          <div className="space-y-3" data-testid="documents-loading">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : null}

        {!loading && !error && documents.length === 0 ? (
          <EmptyState
            title="No documents yet"
            description="Upload a PDF, XLSX or CSV financial statement to begin scanning and extraction."
            action={
              canWrite ? (
                <button
                  type="button"
                  className={buttonClassName({ variant: "primary", size: "sm" })}
                  onClick={focusUpload}
                >
                  Upload document
                </button>
              ) : undefined
            }
          />
        ) : null}

        {!loading && !error && documents.length > 0 && filtered.length === 0 ? (
          <EmptyState
            title="No matching documents"
            description="Try a different search or clear the status/format filters."
            action={
              <button
                type="button"
                className={buttonClassName({ variant: "secondary", size: "sm" })}
                onClick={() => {
                  setQuery("");
                  setStatusFilter("ALL");
                  setFormatFilter("ALL");
                }}
              >
                Clear filters
              </button>
            }
          />
        ) : null}

        {!loading && !error && filtered.length > 0 ? (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <TR>
                    <TH>Document</TH>
                    <TH>Format</TH>
                    <TH>Processing</TH>
                    <TH>Scan</TH>
                    <TH>Extraction</TH>
                    <TH>Uploaded</TH>
                    <TH>Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((doc) => (
                    <TR key={doc.id}>
                      <TD>
                        <Link
                          href={`/organizations/${orgId}/documents/${doc.id}`}
                          className="font-medium text-navy no-underline hover:text-emerald"
                        >
                          {doc.originalFilename}
                        </Link>
                      </TD>
                      <TD>{doc.format}</TD>
                      <TD>
                        <StatusBadge kind="processing" status={doc.processingStatus} />
                      </TD>
                      <TD>
                        <StatusBadge kind="scan" status={doc.scanStatus} />
                      </TD>
                      <TD>
                        <StatusBadge kind="extraction" status={doc.extractionStatus} />
                      </TD>
                      <TD>
                        <time className="font-data text-xs text-text-secondary">
                          {new Date(doc.uploadedAt).toLocaleString()}
                        </time>
                      </TD>
                      <TD>
                        <Link
                          href={`/organizations/${orgId}/documents/${doc.id}`}
                          className="text-sm font-medium text-emerald no-underline hover:underline"
                        >
                          {doc.processingStatus === "REVIEW_REQUIRED" ? "Review" : "Open"}
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            <ul className="space-y-3 md:hidden">
              {filtered.map((doc) => (
                <li
                  key={doc.id}
                  className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
                >
                  <Link
                    href={`/organizations/${orgId}/documents/${doc.id}`}
                    className="break-words font-semibold text-navy no-underline"
                  >
                    {doc.originalFilename}
                  </Link>
                  <p className="mt-1 text-xs text-text-secondary">
                    {doc.format} · {new Date(doc.uploadedAt).toLocaleString()}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 overflow-hidden">
                    <StatusBadge kind="processing" status={doc.processingStatus} />
                    <StatusBadge kind="scan" status={doc.scanStatus} prefix="Scan" />
                    <StatusBadge kind="extraction" status={doc.extractionStatus} prefix="Extract" />
                  </div>
                  <Link
                    href={`/organizations/${orgId}/documents/${doc.id}`}
                    className="mt-3 inline-flex text-sm font-medium text-emerald no-underline hover:underline"
                  >
                    {doc.processingStatus === "REVIEW_REQUIRED" ? "Review figures" : "Open document"}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}
