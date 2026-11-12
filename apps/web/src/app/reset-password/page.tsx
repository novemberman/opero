"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { SiteHeader } from "../../components/site-header";
import { apiFetch } from "../../lib/api";

function ResetPasswordForm() {
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const { status, body } = await apiFetch<{ message?: string }>("/auth/reset-password", {
      method: "POST",
      json: { token, password },
    });
    if (status >= 400) {
      setError(typeof body?.message === "string" ? body.message : "Reset failed");
      return;
    }
    setDone(true);
  }

  return (
    <form className="mx-auto mt-10 max-w-md space-y-4" onSubmit={onSubmit}>
      <h1 className="text-3xl text-ink">Reset password</h1>
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
        <span className="text-muted">New password</span>
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
      {done ? <p className="text-sm text-pine">Password updated. Sign in with the new password.</p> : null}
      <button className="inline-flex min-h-11 items-center rounded-full bg-pine px-5 text-paper" type="submit">
        Update password
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </main>
    </>
  );
}
