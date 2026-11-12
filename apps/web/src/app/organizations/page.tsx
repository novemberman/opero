"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteHeader } from "../../components/site-header";
import { apiFetch } from "../../lib/api";

type OrgRow = {
  role: string;
  organization: { id: string; name: string; slug: string };
};

export default function OrganizationsPage() {
  const [rows, setRows] = useState<OrgRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { status, body } = await apiFetch<{ organizations?: OrgRow[]; message?: string }>(
        "/organizations",
      );
      if (status === 401) {
        setError("Sign in required");
        return;
      }
      if (status >= 400) {
        setError(body.message ?? "Unable to load organizations");
        return;
      }
      setRows(body.organizations ?? []);
    })();
  }, []);

  return (
    <>
      <SiteHeader mark="Organizations" />
      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl text-ink sm:text-4xl">Your organizations</h1>
            <p className="mt-2 text-muted">Select a tenant you belong to, or create a new one.</p>
          </div>
          <Link
            className="inline-flex min-h-11 items-center rounded-full bg-pine px-5 text-paper no-underline"
            href="/organizations/new"
          >
            Create organization
          </Link>
        </div>
        {error ? <p className="mt-6 text-copper">{error}</p> : null}
        <ul className="mt-8 space-y-3">
          {rows.map((row) => (
            <li key={row.organization.id} className="rounded-2xl border border-line bg-white/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl text-ink">{row.organization.name}</h2>
                  <p className="text-sm text-muted">
                    {row.organization.slug} · {row.role}
                  </p>
                </div>
                <Link className="text-pine" href={`/organizations/${row.organization.id}`}>
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
