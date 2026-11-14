"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PublicFooter } from "../../components/marketing/public-footer";
import { PublicHeader } from "../../components/marketing/public-header";
import { Alert, EmptyState, Skeleton, buttonClassName } from "../../components/ui";
import { apiFetch } from "../../lib/api";

type OrgRow = {
  role: string;
  organization: { id: string; name: string; slug: string };
};

export default function OrganizationsPage() {
  const [rows, setRows] = useState<OrgRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { status, body } = await apiFetch<{ organizations?: OrgRow[]; message?: string }>(
        "/organizations",
      );
      if (status === 401) {
        setError("Sign in required");
        setLoading(false);
        return;
      }
      if (status >= 400) {
        setError(body.message ?? "Unable to load organizations");
        setLoading(false);
        return;
      }
      setRows(body.organizations ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <PublicHeader compact />
      <main id="main" className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald">
              Workspaces
            </p>
            <h1 className="mt-2 text-3xl text-navy sm:text-4xl">Your organizations</h1>
            <p className="mt-2 text-text-secondary">
              Select a tenant you belong to, or create a new one.
            </p>
          </div>
          <Link href="/organizations/new" className={buttonClassName()}>
            Create organization
          </Link>
        </div>

        {error ? (
          <div className="mt-6">
            <Alert tone="error" title="Unable to load">
              {error}{" "}
              {error === "Sign in required" ? (
                <Link href="/login" className="font-semibold text-emerald underline">
                  Sign in
                </Link>
              ) : null}
            </Alert>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8 space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title="No organizations yet"
              description="Create an organization to upload statements and run Opero X-Ray."
              action={
                <Link href="/organizations/new" className={buttonClassName()}>
                  Create organization
                </Link>
              }
            />
          </div>
        ) : null}

        <ul className="mt-8 space-y-3">
          {rows.map((row) => (
            <li
              key={row.organization.id}
              className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl text-navy">{row.organization.name}</h2>
                  <p className="text-sm text-text-secondary">
                    {row.organization.slug} · {row.role}
                  </p>
                </div>
                <Link
                  href={`/organizations/${row.organization.id}`}
                  className={buttonClassName({ variant: "secondary", size: "sm" })}
                >
                  Open workspace
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </main>
      <PublicFooter />
    </>
  );
}
