"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiErrorMessage, apiFetch, resetCsrfToken } from "../lib/api";
import { buttonClassName, Button } from "./ui";

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
    return <span className="text-sm text-text-secondary">…</span>;
  }

  if (!user) {
    return (
      <nav className="flex items-center gap-2 text-sm sm:gap-3" aria-label="Account">
        <Link
          className="hidden font-medium text-navy no-underline hover:text-emerald sm:inline"
          href="/login"
        >
          Sign in
        </Link>
        <Link href="/register" className={buttonClassName({ size: "sm" })}>
          Create account
        </Link>
      </nav>
    );
  }

  return (
    <nav className="flex flex-wrap items-center justify-end gap-2 text-sm sm:gap-3" aria-label="Account">
      <Link
        href="/organizations"
        className="max-w-[10rem] truncate font-medium text-text-secondary no-underline hover:text-navy sm:max-w-[14rem]"
        title={user.email}
      >
        {user.name}
      </Link>
      <Button type="button" variant="secondary" size="sm" loading={pending} onClick={() => void onSignOut()}>
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {error ? <span className="basis-full text-right text-sm text-error">{error}</span> : null}
    </nav>
  );
}
