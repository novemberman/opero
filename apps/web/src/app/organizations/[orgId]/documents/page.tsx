"use client";

import { membershipRoleSchema, roleHasPermission, type MembershipRole } from "@opero/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DocumentUploadForm } from "../../../../components/document-upload-form";
import { apiFetch } from "../../../../lib/api";

type DocumentRow = {
  id: string;
  originalFilename: string;
  format: string;
  processingStatus: string;
  scanStatus: string;
  extractionStatus: string;
  uploadedAt: string;
};

export default function DocumentsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [role, setRole] = useState<MembershipRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canWrite = role ? roleHasPermission(role, "xray:write") : false;

  const load = useCallback(async () => {
    const [docsRes, orgsRes] = await Promise.all([
      apiFetch<{ documents?: DocumentRow[]; message?: string }>(`/organizations/${orgId}/documents`),
      apiFetch<{
        organizations?: Array<{ role: string; organization: { id: string } }>;
        message?: string;
      }>("/organizations"),
    ]);
    if (docsRes.status >= 400) {
      setError(docsRes.body.message ?? "Unable to load documents");
      return;
    }
    const membership = orgsRes.body.organizations?.find((row) => row.organization.id === orgId);
    const parsedRole = membership ? membershipRoleSchema.safeParse(membership.role) : null;
    setRole(parsedRole?.success ? parsedRole.data : null);
    setDocuments(docsRes.body.documents ?? []);
    setError(null);
  }, [orgId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
    void load();
  }, [load]);

  return (
    <>
      <div className="mx-auto max-w-6xl py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.16em] text-pine">Opero X-Ray</p>
            <h1 className="mt-2 text-3xl text-ink">Documents</h1>
            <p className="mt-2 max-w-2xl text-muted">
              Upload PDF, XLSX, or CSV financial reports (max 20 MB). Files are quarantined, scanned,
              then extracted with source evidence for review.
            </p>
          </div>
          <Link className="text-pine underline" href={`/organizations/${orgId}`}>
            Back to organization
          </Link>
        </div>

        {canWrite ? (
          <DocumentUploadForm orgId={orgId} onUploaded={load} />
        ) : (
          <p className="mb-10 text-sm text-muted">
            View-only access: uploads require Analyst or higher.
          </p>
        )}

        {error ? <p className="mb-4 text-sm text-copper">{error}</p> : null}

        <ul className="divide-y divide-line border border-line">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <Link
                  className="font-medium text-ink underline"
                  href={`/organizations/${orgId}/documents/${doc.id}`}
                >
                  {doc.originalFilename}
                </Link>
                <p className="text-sm text-muted">
                  {doc.format} · {doc.processingStatus} · scan {doc.scanStatus} · extract{" "}
                  {doc.extractionStatus}
                </p>
              </div>
              <time className="text-sm text-muted">{new Date(doc.uploadedAt).toLocaleString()}</time>
            </li>
          ))}
          {documents.length === 0 ? (
            <li className="px-4 py-6 text-muted">No documents uploaded yet.</li>
          ) : null}
        </ul>
      </div>
    </>
  );
}
