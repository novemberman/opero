"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { AuthShell } from "../../components/auth/auth-shell";
import { AuthLinks } from "../../components/auth-form";
import { Alert, Button, Input } from "../../components/ui";
import { apiFetch } from "../../lib/api";

function ResetPasswordForm() {
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    if (password.length < 12) {
      setFieldError("Password must be at least 12 characters");
      return;
    }
    setPending(true);
    try {
      const { status, body } = await apiFetch<{ message?: string }>("/auth/reset-password", {
        method: "POST",
        json: { token, password },
      });
      if (status >= 400) {
        setError(typeof body?.message === "string" ? body.message : "Reset failed");
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
    <form className="space-y-5" onSubmit={onSubmit} noValidate>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-navy sm:text-[1.75rem]">
          Reset password
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">
          Choose a new password for your Opero account. Use at least 12 characters.
        </p>
      </div>
      <Input
        label="Reset token"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        required
        autoComplete="one-time-code"
      />
      <div className="space-y-2">
        <Input
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={12}
          required
          autoComplete="new-password"
          error={fieldError}
          hint="At least 12 characters"
        />
        <p className={`text-xs ${password.length >= 12 ? "text-success" : "text-text-secondary"}`}>
          {password.length >= 12 ? "✓" : "○"} At least 12 characters
        </p>
      </div>
      {error ? (
        <Alert tone="error" title="Reset failed">
          {error}
        </Alert>
      ) : null}
      {done ? (
        <Alert tone="success" title="Password updated">
          You can now{" "}
          <Link href="/login" className="font-semibold text-emerald underline">
            sign in
          </Link>{" "}
          with the new password.
        </Alert>
      ) : null}
      <Button type="submit" className="w-full" size="lg" loading={pending} disabled={done}>
        Update password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell footer={<AuthLinks links={[{ href: "/login", label: "Back to sign in" }]} />}>
      <Suspense fallback={<p className="text-sm text-text-secondary">Loading reset form…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
