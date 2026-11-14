"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { AuthShell } from "../../components/auth/auth-shell";
import { AuthLinks } from "../../components/auth-form";
import { Alert, Button, Input } from "../../components/ui";
import { apiFetch } from "../../lib/api";

function VerifyEmailForm() {
  const params = useSearchParams();
  const initial = params.get("token") ?? "";
  const [token, setToken] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { status, body } = await apiFetch<{ message?: string }>("/auth/verify-email", {
        method: "POST",
        json: { token },
      });
      if (status >= 400) {
        setError(typeof body?.message === "string" ? body.message : "Verification failed");
        return;
      }
      setDone(true);
    } catch {
      setError("Unable to reach Opero. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-navy sm:text-[1.75rem]">
          Verify email
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">
          Open the link from your verification email, or paste the token below if it was not filled
          in automatically.
        </p>
      </div>
      <Input
        label="Verification token"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        required
        autoComplete="one-time-code"
      />
      {error ? (
        <Alert tone="error" title="Verification failed">
          {error}
        </Alert>
      ) : null}
      {done ? (
        <Alert tone="success" title="Email verified">
          You can now{" "}
          <Link href="/login" className="font-semibold text-emerald underline">
            sign in
          </Link>
          .
        </Alert>
      ) : null}
      <Button type="submit" className="w-full" size="lg" loading={pending} disabled={done}>
        Verify email
      </Button>
    </form>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell footer={<AuthLinks links={[{ href: "/login", label: "Sign in" }]} />}>
      <Suspense fallback={<p className="text-sm text-text-secondary">Loading verification…</p>}>
        <VerifyEmailForm />
      </Suspense>
    </AuthShell>
  );
}
