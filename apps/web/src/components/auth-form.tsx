"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, resetCsrfToken } from "../lib/api";

type Field = {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
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
}: {
  title: string;
  subtitle: string;
  actionPath: string;
  method?: string;
  fields: Field[];
  submitLabel: string;
  successRedirect?: string;
  onSuccessMessage?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const form = new FormData(event.currentTarget);
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
      if (onSuccessMessage) {
        setMessage(onSuccessMessage);
      }
      if (successRedirect) {
        router.push(successRedirect);
        router.refresh();
      }
    } catch {
      setError("Unable to reach the API. Confirm it is running on port 3001.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mx-auto mt-10 max-w-md space-y-4" onSubmit={onSubmit}>
      <div>
        <h1 className="text-3xl text-ink sm:text-4xl">{title}</h1>
        <p className="mt-2 text-muted">{subtitle}</p>
      </div>
      {fields.map((field) => (
        <label key={field.name} className="block space-y-1 text-sm">
          <span className="text-muted">{field.label}</span>
          <input
            className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-ink"
            name={field.name}
            type={field.type ?? "text"}
            autoComplete={field.autoComplete}
            required={field.required ?? true}
          />
        </label>
      ))}
      {error ? <p className="text-sm text-copper">{error}</p> : null}
      {message ? <p className="text-sm text-pine">{message}</p> : null}
      <button
        className="inline-flex min-h-11 items-center rounded-full bg-pine px-5 text-paper disabled:opacity-60"
        type="submit"
        disabled={pending}
      >
        {pending ? "Working…" : submitLabel}
      </button>
    </form>
  );
}
