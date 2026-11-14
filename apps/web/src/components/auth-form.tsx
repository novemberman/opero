"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, resetCsrfToken } from "../lib/api";
import { Alert, Button, Input } from "./ui";

export type AuthField = {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
  minLength?: number;
};

export function AuthForm({
  title,
  subtitle,
  actionPath,
  method = "POST",
  fields,
  submitLabel,
  successRedirect,
  onSuccessMessage,
  belowSubmit,
}: {
  title: string;
  subtitle: string;
  actionPath: string;
  method?: string;
  fields: AuthField[];
  submitLabel: string;
  successRedirect?: string;
  onSuccessMessage?: string;
  belowSubmit?: ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [passwordValue, setPasswordValue] = useState("");

  const passwordField = useMemo(
    () => fields.find((field) => field.name === "password" && field.type === "password"),
    [fields],
  );

  const passwordChecks = useMemo(() => {
    if (!passwordField) return null;
    const min = passwordField.minLength ?? 12;
    return {
      length: passwordValue.length >= min,
      min,
    };
  }, [passwordField, passwordValue]);

  function validate(form: FormData): boolean {
    const next: Record<string, string> = {};
    for (const field of fields) {
      const value = String(form.get(field.name) ?? "").trim();
      if ((field.required ?? true) && !value) {
        next[field.name] = `${field.label} is required`;
        continue;
      }
      if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        next[field.name] = "Enter a valid email address";
      }
      if (field.name === "password" && field.minLength && value.length < field.minLength) {
        next[field.name] = `Password must be at least ${field.minLength} characters`;
      }
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    if (!validate(form)) {
      setPending(false);
      return;
    }

    const json: Record<string, string> = {};
    for (const field of fields) {
      json[field.name] = String(form.get(field.name) ?? "");
    }

    try {
      const { status, body } = await apiFetch<{ message?: string | string[] }>(actionPath, {
        method,
        json,
      });
      if (status >= 400) {
        const detail =
          typeof body?.message === "string"
            ? body.message
            : Array.isArray(body?.message)
              ? body.message.join(", ")
              : "Request failed";
        setError(detail);
        if (status === 403) {
          resetCsrfToken();
        }
        return;
      }
      resetCsrfToken();
      if (onSuccessMessage) {
        setMessage(onSuccessMessage);
      }
      if (successRedirect) {
        router.push(successRedirect);
        router.refresh();
      }
    } catch {
      setError("Unable to reach Opero. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit} noValidate>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-navy sm:text-[1.75rem]">{title}</h1>
        <p className="text-sm leading-relaxed text-text-secondary">{subtitle}</p>
      </div>

      <div className="space-y-4">
        {fields.map((field) => {
          const isNewPassword = field.name === "password" && field.autoComplete === "new-password";
          return (
            <div key={field.name} className="space-y-2">
              <Input
                name={field.name}
                label={field.label}
                type={field.type ?? "text"}
                autoComplete={field.autoComplete}
                required={field.required ?? true}
                minLength={field.minLength}
                hint={field.hint}
                error={fieldErrors[field.name]}
                onChange={
                  isNewPassword
                    ? (event) => setPasswordValue(event.currentTarget.value)
                    : undefined
                }
              />
              {isNewPassword && passwordChecks ? (
                <ul className="space-y-1 text-xs" aria-live="polite">
                  <li
                    className={
                      passwordChecks.length ? "text-success" : "text-text-secondary"
                    }
                  >
                    {passwordChecks.length ? "✓" : "○"} At least {passwordChecks.min} characters
                  </li>
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <Alert tone="error" title="Unable to continue">
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert tone="success" title="Success">
          {message}
        </Alert>
      ) : null}

      <Button type="submit" className="w-full" loading={pending} size="lg">
        {pending ? "Working…" : submitLabel}
      </Button>
      {belowSubmit}
    </form>
  );
}

export function AuthLinks({
  links,
}: {
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="font-medium text-emerald no-underline hover:underline">
          {link.label}
        </Link>
      ))}
    </p>
  );
}
