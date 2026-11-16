"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthLinks } from "../../../components/auth-form";
import { AuthShell } from "../../../components/auth/auth-shell";
import { LegalLinksInline } from "../../../components/legal/legal-nav";
import { Alert, Button, Input } from "../../../components/ui";
import { apiFetch, resetCsrfToken } from "../../../lib/api";
import {
  PILOT_ACCEPT_API_PATH,
  PILOT_ACCEPT_PASSWORD_MIN,
  type PilotAcceptSuccessBody,
  pilotAcceptDestination,
  pilotInviteErrorMessage,
  readPilotInviteTokenFromSearchParams,
  stripTokenQueryFromHistory,
  validatePilotAcceptPasswords,
} from "../../../lib/pilot-accept";

function PilotAcceptForm() {
  const router = useRouter();
  const params = useSearchParams();
  const inviteTokenRef = useRef("");
  const [tokenReady, setTokenReady] = useState(false);
  const [missingToken, setMissingToken] = useState(false);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const token = readPilotInviteTokenFromSearchParams(params);
    inviteTokenRef.current = token;
    setMissingToken(!token);
    setTokenReady(true);
    // Strip token from the address bar as soon as it is held in memory.
    stripTokenQueryFromHistory();
  }, [params]);

  const passwordProgress = useMemo(() => {
    const min = PILOT_ACCEPT_PASSWORD_MIN;
    return {
      min,
      length: password.length >= min,
      percent: Math.min(100, Math.round((password.length / min) * 100)),
    };
  }, [password]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setFieldError(null);
    setError(null);
    setMessage(null);

    const token = inviteTokenRef.current;
    if (!token) {
      setMissingToken(true);
      setError("This invitation link is missing its secure token. Open the link from your email again.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFieldError("Full name is required");
      return;
    }

    const passwordProblem = validatePilotAcceptPasswords(password, confirmPassword);
    if (passwordProblem) {
      setFieldError(passwordProblem);
      return;
    }

    setPending(true);
    try {
      const { status, body } = await apiFetch<
        PilotAcceptSuccessBody & { message?: unknown; code?: string }
      >(PILOT_ACCEPT_API_PATH, {
        method: "POST",
        json: {
          token,
          name: trimmedName,
          password,
        },
      });

      if (status >= 400) {
        setError(pilotInviteErrorMessage(body, status));
        if (status === 403) resetCsrfToken();
        return;
      }

      const organizationId = body?.organization?.id;
      const email = body?.user?.email;
      if (!organizationId || !email) {
        setMessage("Invitation accepted. Sign in to open your pilot organization.");
        return;
      }

      // Establish a session with the password the owner just chose (email already verified).
      const login = await apiFetch("/auth/login", {
        method: "POST",
        json: { email, password },
      });
      resetCsrfToken();

      if (login.status >= 400) {
        setMessage("Invitation accepted. Sign in with your new password to continue.");
        return;
      }

      router.push(pilotAcceptDestination(organizationId));
      router.refresh();
    } catch {
      setError("Unable to reach Opero. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (!tokenReady) {
    return <p className="text-sm text-text-secondary">Loading invitation…</p>;
  }

  if (missingToken) {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5 sm:space-y-2">
          <h1 className="text-xl font-semibold tracking-tight text-navy sm:text-2xl">
            Invitation link incomplete
          </h1>
          <p className="text-sm leading-relaxed text-text-secondary">
            Open the full link from your Opero pilot invitation email. Public registration is not
            available for this pilot.
          </p>
        </div>
        <Alert tone="error" title="Missing invitation token">
          No invitation token was found in this page link.
        </Alert>
        <AuthLinks links={[{ href: "/login", label: "Sign in instead" }]} />
      </div>
    );
  }

  return (
    <form className="space-y-4 sm:space-y-5" onSubmit={onSubmit} noValidate>
      <div className="space-y-1.5 sm:space-y-2">
        <h1 className="text-xl font-semibold tracking-tight text-navy sm:text-2xl">
          Accept pilot invitation
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">
          Create your owner account for the Opero live pilot organization. This link is single-use
          and does not open public registration.
        </p>
      </div>

      <div className="space-y-3.5 sm:space-y-4">
        <Input
          name="name"
          label="Full name"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          disabled={pending}
          error={fieldError && /name/i.test(fieldError) ? fieldError : undefined}
        />
        <div className="space-y-1.5">
          <Input
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            minLength={PILOT_ACCEPT_PASSWORD_MIN}
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            disabled={pending}
            error={
              fieldError && /at least|too long/i.test(fieldError) ? fieldError : undefined
            }
          />
          <div className="space-y-1.5" aria-live="polite">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={passwordProgress.min}
              aria-valuenow={Math.min(password.length, passwordProgress.min)}
              aria-label="Password length"
            >
              <div
                className={`h-full rounded-full transition-[width] ${
                  passwordProgress.length ? "bg-success" : "bg-emerald"
                }`}
                style={{ width: `${passwordProgress.percent}%` }}
              />
            </div>
            <p
              className={`text-xs ${
                passwordProgress.length ? "font-medium text-success" : "text-text-secondary"
              }`}
            >
              {passwordProgress.length
                ? `Ready — at least ${passwordProgress.min} characters`
                : `${password.length}/${passwordProgress.min} characters minimum`}
            </p>
          </div>
        </div>
        <Input
          name="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PILOT_ACCEPT_PASSWORD_MIN}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.currentTarget.value)}
          disabled={pending}
          error={fieldError && /do not match/i.test(fieldError) ? fieldError : undefined}
        />
      </div>
      {error ? (
        <Alert tone="error" title="Unable to accept invitation">
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert tone="success" title="Invitation accepted">
          {message}{" "}
          <Link href="/login" className="font-medium text-emerald no-underline hover:underline">
            Sign in
          </Link>
        </Alert>
      ) : null}

      <Button type="submit" className="w-full" loading={pending} size="lg" disabled={pending}>
        {pending ? "Accepting…" : "Accept invitation"}
      </Button>
    </form>
  );
}

export default function PilotAcceptPage() {
  return (
    <AuthShell
      footer={
        <div className="space-y-3">
          <AuthLinks links={[{ href: "/login", label: "Already have an account? Sign in" }]} />
          <LegalLinksInline />
        </div>
      }
    >
      <Suspense fallback={<p className="text-sm text-text-secondary">Loading invitation…</p>}>
        <PilotAcceptForm />
      </Suspense>
    </AuthShell>
  );
}
