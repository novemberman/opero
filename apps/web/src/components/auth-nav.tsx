"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiErrorMessage, apiFetch, resetCsrfToken } from "../lib/api";

type AuthUser = { id: string; email: string; name: string };

export function AuthNav() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { status, body } = await apiFetch<{ user?: AuthUser; message?: string }>("/auth/me");
        if (cancelled) return;
        if (status === 200 && body.user) {
          setUser(body.user);
        } else {
          setUser(null);
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSignOut() {
    setPending(true);
    setError(null);
    try {
      const { status, body } = await apiFetch<{ message?: string }>("/auth/logout", {
        method: "POST",
      });
      resetCsrfToken();
      if (status >= 400 && status !== 401) {
        setError(apiErrorMessage(body, "Unable to sign out"));
        return;
      }
      setUser(null);
      router.push("/login");
      router.refresh();
    } catch {
      setError("Unable to sign out");
    } finally {
      setPending(false);
    }
  }

  if (!loaded) {
    return <span className="text-sm text-muted">…</span>;
  }

  if (!user) {
    return (
      <nav className="flex items-center gap-3 text-sm" aria-label="Account">
        <Link className="text-ink no-underline hover:text-pine" href="/login">
          Sign in
        </Link>
        <Link
          className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-ink no-underline hover:border-ink"
          href="/register"
        >
          Create account
        </Link>
      </nav>
    );
  }

  return (
    <nav className="flex flex-wrap items-center justify-end gap-3 text-sm" aria-label="Account">
      <span className="max-w-[14rem] truncate text-muted" title={user.email}>
        {user.name}
      </span>
      <button
        type="button"
        className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-ink hover:border-ink disabled:opacity-60"
        onClick={() => void onSignOut()}
        disabled={pending}
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error ? <span className="basis-full text-right text-copper">{error}</span> : null}
    </nav>
  );
}
