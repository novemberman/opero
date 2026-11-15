"use client";

import { membershipRoleSchema, roleHasPermission, type MembershipRole } from "@opero/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { Alert, Badge, Card, EmptyState, Skeleton, buttonClassName } from "../../../components/ui";

type DocumentRow = {
  id: string;
  originalFilename: string;
  format: string;
  processingStatus: string;
  scanStatus: string;
  extractionStatus: string;
  uploadedAt: string;
};

type DiagnosticRun = {
  id: string;
  status: string;
  currency: string | null;
  periodLabel: string | null;
  createdAt: string;
  completedAt: string | null;
  score?: { status: string; overallScore: number | null } | null;
};

type ReportRow = {
  id: string;
  title: string;
  status: string;
  verifiedPublication: boolean;
  publishedAt: string | null;
  createdAt: string;
};

type OrgInfo = { name: string; slug: string };

function statusTone(
  status: string,
): "neutral" | "success" | "warning" | "error" | "info" | "emerald" {
  const value = status.toUpperCase();
  if (["READY", "SUCCEEDED", "CLEAN", "PUBLISHED", "COMPLETE"].includes(value)) return "success";
  if (["REVIEW_REQUIRED", "PENDING", "QUEUED", "RUNNING", "DRAFT"].includes(value)) return "warning";
  if (["FAILED", "REJECTED", "INFECTED", "ERROR"].includes(value)) return "error";
  return "neutral";
}

export default function OrganizationDashboardPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [role, setRole] = useState<MembershipRole | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [runs, setRuns] = useState<DiagnosticRun[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const canWrite = role ? roleHasPermission(role, "xray:write") : false;
  const canReadXray = role ? roleHasPermission(role, "xray:read") : false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgRes, orgsRes, docsRes, runsRes, reportsRes] = await Promise.all([
        apiFetch<{ organization?: OrgInfo; message?: string }>(`/organizations/${orgId}`),
        apiFetch<{
          organizations?: Array<{ role: string; organization: { id: string } }>;
        }>("/organizations"),
        apiFetch<{ documents?: DocumentRow[]; message?: string }>(
          `/organizations/${orgId}/documents`,
        ),
        apiFetch<{ runs?: DiagnosticRun[]; message?: string }>(
          `/organizations/${orgId}/diagnostics`,
        ),
        apiFetch<{ reports?: ReportRow[]; message?: string }>(`/organizations/${orgId}/reports`),
      ]);

      if (orgRes.status >= 400) {
        setError(orgRes.body.message ?? "Unable to load organization");
        setLoading(false);
        return;
      }

      setOrg(orgRes.body.organization ?? null);
      const membership = orgsRes.body.organizations?.find((row) => row.organization.id === orgId);
      const parsed = membership ? membershipRoleSchema.safeParse(membership.role) : null;
      setRole(parsed?.success ? parsed.data : null);

      if (docsRes.status < 400) setDocuments(docsRes.body.documents ?? []);
      if (runsRes.status < 400) setRuns(runsRes.body.runs ?? []);
      if (reportsRes.status < 400) setReports(reportsRes.body.reports ?? []);

      const partialFailure =
        docsRes.status >= 400 || runsRes.status >= 400 || reportsRes.status >= 400;
      if (partialFailure) {
        setError("Some workspace panels could not be loaded. Available data is shown below.");
      }
    } catch {
      setError("Unable to reach Opero. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const reviewDocs = useMemo(
    () =>
      documents.filter((doc) =>
        ["REVIEW_REQUIRED", "FAILED"].includes(doc.processingStatus.toUpperCase()),
      ),
    [documents],
  );

  const readyDocs = useMemo(
    () =>
      documents.filter(
        (doc) =>
          doc.scanStatus === "CLEAN" &&
          ["READY", "REVIEW_REQUIRED"].includes(doc.processingStatus),
      ),
    [documents],
  );

  const latestRun = runs[0] ?? null;
  const latestScore =
    latestRun?.score?.overallScore != null && latestRun.score.status !== "INELIGIBLE"
      ? latestRun.score.overallScore
      : null;
  const scoreWithheld =
    latestRun?.score?.status === "INELIGIBLE" ||
    (latestRun?.status === "SUCCEEDED" && latestRun.score?.overallScore == null);

  const publishedReports = reports.filter(
    (report) => report.status === "PUBLISHED" || report.verifiedPublication,
  );
  const draftReports = reports.filter((report) => report.status === "DRAFT");

  const actions = useMemo(() => {
    const items: Array<{ title: string; detail: string; href: string; primary?: boolean }> = [];
    if (canWrite && documents.length === 0) {
      items.push({
        title: "Upload a statement",
        detail: "Add PDF, CSV or spreadsheet financials to begin extraction.",
        href: `/organizations/${orgId}/documents`,
        primary: true,
      });
    }
    if (canWrite && reviewDocs.length > 0) {
      items.push({
        title: "Review extracted figures",
        detail: `${reviewDocs.length} document${reviewDocs.length === 1 ? "" : "s"} need attention.`,
        href: `/organizations/${orgId}/documents/${reviewDocs[0]!.id}`,
        primary: true,
      });
    }
    if (canWrite && readyDocs.length > 0 && runs.length === 0) {
      items.push({
        title: "Run diagnostics",
        detail: "Reviewed statements are available for analysis.",
        href: `/organizations/${orgId}/diagnostics`,
        primary: items.length === 0,
      });
    }
    if (canReadXray && latestRun?.status === "SUCCEEDED") {
      items.push({
        title: "Open latest diagnostic",
        detail: latestRun.periodLabel ?? `Run ${latestRun.id.slice(0, 8)}…`,
        href: `/organizations/${orgId}/diagnostics/${latestRun.id}`,
      });
    }
    if (canWrite && draftReports.length > 0) {
      items.push({
        title: "Continue draft report",
        detail: draftReports[0]!.title,
        href: `/organizations/${orgId}/reports/${draftReports[0]!.id}`,
      });
    }
    if (canReadXray && publishedReports.length > 0) {
      items.push({
        title: "View published reports",
        detail: `${publishedReports.length} published`,
        href: `/organizations/${orgId}/reports`,
      });
    }
    if (canWrite && documents.length > 0) {
      items.push({
        title: "Upload additional statements",
        detail: "Improve coverage for diagnostics and readiness.",
        href: `/organizations/${orgId}/documents`,
      });
    }
    return items.slice(0, 5);
  }, [
    canWrite,
    canReadXray,
    documents.length,
    reviewDocs,
    readyDocs.length,
    runs.length,
    latestRun,
    draftReports,
    publishedReports.length,
    orgId,
  ]);

  const recentDocs = documents.slice(0, 5);
  const recentReports = reports.slice(0, 4);
  const isEmpty = documents.length === 0 && runs.length === 0 && reports.length === 0;

  if (loading) {
    return (
      <div className="space-y-6" data-testid="dashboard-loading">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="organization-dashboard">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="brand-kicker">Workspace overview</p>
          <h1 className="mt-2 text-3xl text-navy sm:text-4xl">{org?.name ?? "Organization"}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {org?.slug ? `${org.slug} · ` : ""}
            Financial intelligence command centre
            {role ? ` · ${role}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite ? (
            <Link href={`/organizations/${orgId}/documents`} className={buttonClassName()}>
              Upload statement
            </Link>
          ) : null}
          <Link
            href={`/organizations/${orgId}/diagnostics`}
            className={buttonClassName({ variant: "secondary" })}
          >
            Diagnostics
          </Link>
        </div>
      </header>

      {error ? (
        <Alert tone="warning" title="Partial data">
          {error}
        </Alert>
      ) : null}

      {isEmpty ? (
        <div data-testid="dashboard-empty">
          <EmptyState
            title="No financial activity yet"
            description="Upload a statement to begin extraction, review and diagnostics. Opero never invents scores before reviewed data is available."
            action={
              canWrite ? (
                <Link href={`/organizations/${orgId}/documents`} className={buttonClassName()}>
                  Upload your first document
                </Link>
              ) : (
                <p className="text-sm text-text-secondary">Ask an Analyst or Owner to upload files.</p>
              )
            }
          />
        </div>
      ) : null}

      <section aria-labelledby="intel-heading">
        <h2 id="intel-heading" className="text-lg font-semibold text-navy">
          Financial intelligence
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="!p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
              Latest diagnostic
            </p>
            {latestRun ? (
              <>
                <p className="mt-2 font-medium text-navy">{latestRun.periodLabel ?? "Diagnostic run"}</p>
                <div className="mt-2">
                  <Badge tone={statusTone(latestRun.status)}>{latestRun.status}</Badge>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">No runs yet</p>
            )}
          </Card>

          <Card className="!p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
              Business Health Score
            </p>
            {latestScore != null ? (
              <p className="mt-2 font-data text-3xl font-semibold text-navy">{latestScore}</p>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">
                {scoreWithheld
                  ? "Withheld — data quality or eligibility insufficient"
                  : "Unavailable until a successful eligible run"}
              </p>
            )}
          </Card>

          <Card className="!p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
              Statement coverage
            </p>
            <p className="mt-2 font-data text-3xl font-semibold text-navy">{documents.length}</p>
            <p className="mt-1 text-xs text-text-secondary">
              {readyDocs.length} ready for analysis · {reviewDocs.length} need review
            </p>
          </Card>

          <Card className="!p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
              Report readiness
            </p>
            <p className="mt-2 font-data text-3xl font-semibold text-navy">{publishedReports.length}</p>
            <p className="mt-1 text-xs text-text-secondary">
              published · {draftReports.length} draft
            </p>
          </Card>
        </div>
      </section>

      <section aria-labelledby="actions-heading" className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <h2 id="actions-heading" className="text-lg font-semibold text-navy">
            Action centre
          </h2>
          <ul className="mt-4 space-y-3">
            {actions.length === 0 ? (
              <li>
                <EmptyState
                  title="No actions required"
                  description="Workspace is up to date with the data currently available."
                />
              </li>
            ) : (
              actions.map((action) => (
                <li key={action.title}>
                  <Link
                    href={action.href}
                    className="block rounded-2xl border border-border bg-surface p-4 no-underline shadow-sm transition-colors hover:border-emerald/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-navy">{action.title}</p>
                      {action.primary ? <Badge tone="emerald">Next</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-text-secondary">{action.detail}</p>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-navy">Product areas</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              ["Documents", "documents"],
              ["Diagnostics", "diagnostics"],
              ["Readiness", "readiness"],
              ["Reconciliations", "reconciliations"],
              ["AI interpretation", "ai"],
              ["Reports", "reports"],
              ["Billing", "billing"],
              ["Members", "members"],
              ["Settings", "settings"],
            ].map(([label, path]) => (
              <Link
                key={path}
                href={`/organizations/${orgId}/${path}`}
                className="rounded-xl border border-border bg-surface px-3 py-3 text-sm font-medium text-navy no-underline hover:border-emerald/40 hover:text-emerald"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="activity-heading" className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 id="activity-heading" className="text-lg font-semibold text-navy">
              Recent documents
            </h2>
            <Link
              href={`/organizations/${orgId}/documents`}
              className="text-sm font-medium text-emerald no-underline hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface">
            {recentDocs.length === 0 ? (
              <li className="px-4 py-6 text-sm text-text-secondary">No documents uploaded yet.</li>
            ) : (
              recentDocs.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/organizations/${orgId}/documents/${doc.id}`}
                      className="truncate font-medium text-navy no-underline hover:text-emerald"
                    >
                      {doc.originalFilename}
                    </Link>
                    <p className="text-xs text-text-secondary">
                      {doc.format} · {new Date(doc.uploadedAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge tone={statusTone(doc.processingStatus)}>{doc.processingStatus}</Badge>
                </li>
              ))
            )}
          </ul>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-navy">Recent reports</h2>
            <Link
              href={`/organizations/${orgId}/reports`}
              className="text-sm font-medium text-emerald no-underline hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface">
            {recentReports.length === 0 ? (
              <li className="px-4 py-6 text-sm text-text-secondary">No reports yet.</li>
            ) : (
              recentReports.map((report) => (
                <li key={report.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/organizations/${orgId}/reports/${report.id}`}
                      className="truncate font-medium text-navy no-underline hover:text-emerald"
                    >
                      {report.title}
                    </Link>
                    <p className="text-xs text-text-secondary">
                      {new Date(report.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge tone={statusTone(report.status)}>{report.status}</Badge>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
