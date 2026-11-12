"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SiteHeader } from "../../../../components/site-header";
import { apiFetch } from "../../../../lib/api";

export default function OrganizationSettingsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { status, body } = await apiFetch<{ organization?: { name: string } }>(
        `/organizations/${orgId}`,
      );
      if (status < 400 && body.organization) {
        setName(body.organization.name);
      }
    })();
  }, [orgId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const { status, body } = await apiFetch<{ message?: string }>(`/organizations/${orgId}`, {
      method: "PATCH",
      json: { name },
    });
    if (status >= 400) {
      setError(typeof body.message === "string" ? body.message : "Update failed");
      return;
    }
    setMessage("Organization updated");
  }

  return (
    <>
      <SiteHeader mark="Settings" />
      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <form className="mx-auto max-w-md space-y-4" onSubmit={onSubmit}>
          <h1 className="text-3xl text-ink">Organization settings</h1>
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Name</span>
            <input
              className="min-h-11 w-full rounded-xl border border-line bg-white px-3"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          {error ? <p className="text-sm text-copper">{error}</p> : null}
          {message ? <p className="text-sm text-pine">{message}</p> : null}
          <button className="inline-flex min-h-11 items-center rounded-full bg-pine px-5 text-paper" type="submit">
            Save
          </button>
        </form>
      </main>
    </>
  );
}
