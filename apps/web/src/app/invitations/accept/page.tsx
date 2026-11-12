"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "../../../components/site-header";
import { apiFetch } from "../../../lib/api";

function AcceptInvitationForm() {
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const { status, body } = await apiFetch<{ message?: string }>("/invitations/accept-public", {
      method: "POST",
      json: { token, name, password },
    });
    if (status >= 400) {
      setError(typeof body.message === "string" ? body.message : "Unable to accept invitation");
      return;
    }
    setDone(true);
  }

  return (
    <form className="mx-auto mt-10 max-w-md space-y-4" onSubmit={onSubmit}>
      <h1 className="text-3xl text-ink">Accept invitation</h1>
      <p className="text-muted">
        New users provide a name and password. Existing accounts can sign in and use the
        authenticated accept endpoint instead.
      </p>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Token</span>
        <input
          className="min-h-11 w-full rounded-xl border border-line bg-white px-3"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Name</span>
        <input
          className="min-h-11 w-full rounded-xl border border-line bg-white px-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Password</span>
        <input
          className="min-h-11 w-full rounded-xl border border-line bg-white px-3"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={12}
          required
        />
      </label>
      {error ? <p className="text-sm text-copper">{error}</p> : null}
      {done ? <p className="text-sm text-pine">Invitation accepted. You can sign in.</p> : null}
      <button className="inline-flex min-h-11 items-center rounded-full bg-pine px-5 text-paper" type="submit">
        Accept
      </button>
    </form>
  );
}

export default function AcceptInvitationPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <AcceptInvitationForm />
        </Suspense>
      </main>
    </>
  );
}
