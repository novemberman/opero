"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteHeader } from "../../../components/site-header";
import { apiFetch } from "../../../lib/api";

export default function OrganizationDetailPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const [org, setOrg] = useState<{ name: string; slug: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { status, body } = await apiFetch<{
        organization?: { name: string; slug: string };
        message?: string;
      }>(`/organizations/${orgId}`);
      if (status >= 400) {
        setError(body.message ?? "Unable to load organization");
        return;
      }
      setOrg(body.organization ?? null);
    })();
  }, [orgId]);

  return (
    <>
      <SiteHeader mark="Organizations" />
      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        {error ? <p className="text-copper">{error}</p> : null}
        {org ? (
          <>
            <h1 className="text-3xl text-ink sm:text-4xl">{org.name}</h1>
            <p className="mt-2 text-muted">{org.slug}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-ink no-underline"
                href={`/organizations/${orgId}/settings`}
              >
                Settings
              </Link>
              <Link
                className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-ink no-underline"
                href={`/organizations/${orgId}/members`}
              >
                Members
              </Link>
            </div>
          </>
        ) : null}
      </main>
    </>
  );
}
