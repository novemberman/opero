"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { SiteHeader } from "../../components/site-header";
import { apiFetch } from "../../lib/api";

function VerifyEmailForm() {
  const params = useSearchParams();
  const initial = params.get("token") ?? "";
  const [token, setToken] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const { status, body } = await apiFetch<{ message?: string }>("/auth/verify-email", {
      method: "POST",
      json: { token },
    });
    if (status >= 400) {
      setError(typeof body?.message === "string" ? body.message : "Verification failed");
      return;
    }
    setDone(true);
  }

  return (
    <form className="mx-auto mt-10 max-w-md space-y-4" onSubmit={onSubmit}>
      <h1 className="text-3xl text-ink">Verify email</h1>
      <p className="text-muted">Paste the token from your verification email if it is not filled in.</p>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Token</span>
        <input
          className="min-h-11 w-full rounded-xl border border-line bg-white px-3"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
      </label>
      {error ? <p className="text-sm text-copper">{error}</p> : null}
      {done ? <p className="text-sm text-pine">Email verified. You can sign in.</p> : null}
      <button className="inline-flex min-h-11 items-center rounded-full bg-pine px-5 text-paper" type="submit">
        Verify
      </button>
    </form>
  );
}

export default function VerifyEmailPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <VerifyEmailForm />
        </Suspense>
      </main>
    </>
  );
}
