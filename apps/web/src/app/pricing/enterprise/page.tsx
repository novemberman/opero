"use client";

import Link from "next/link";
import { useState } from "react";
import { SiteHeader } from "../../../components/site-header";
import { apiFetch } from "../../../lib/api";

export default function EnterpriseQuotePage() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus("sending");
    const { status: httpStatus, body } = await apiFetch<{ message?: string; quote?: { id: string } }>(
      "/billing/enterprise-quotes",
      {
        method: "POST",
        json: {
          contactName: form.get("contactName"),
          contactEmail: form.get("contactEmail"),
          companyName: form.get("companyName"),
          message: form.get("message"),
        },
      },
    );
    if (httpStatus >= 400) {
      setStatus("error");
      setMessage(body.message ?? "Unable to submit request");
      return;
    }
    setStatus("sent");
    setMessage("Request received. Opero will follow up with a custom quotation.");
  }

  return (
    <>
      <SiteHeader mark="Enterprise" />
      <main className="mx-auto max-w-xl px-5 py-12 sm:px-8">
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink">Enterprise</h1>
        <p className="mt-3 text-muted">
          Custom quotation for larger teams. This form does not charge a card and does not start a
          subscription.
        </p>
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm text-ink">
            Contact name
            <input className="mt-1 w-full border border-line bg-paper px-3 py-2" name="contactName" required />
          </label>
          <label className="block text-sm text-ink">
            Work email
            <input
              className="mt-1 w-full border border-line bg-paper px-3 py-2"
              name="contactEmail"
              type="email"
              required
            />
          </label>
          <label className="block text-sm text-ink">
            Company
            <input className="mt-1 w-full border border-line bg-paper px-3 py-2" name="companyName" required />
          </label>
          <label className="block text-sm text-ink">
            Requirements
            <textarea
              className="mt-1 w-full border border-line bg-paper px-3 py-2"
              name="message"
              rows={5}
              required
            />
          </label>
          <button
            className="inline-flex min-h-11 items-center rounded-full bg-pine px-5 text-paper"
            disabled={status === "sending" || status === "sent"}
            type="submit"
          >
            {status === "sending" ? "Sending…" : "Request quotation"}
          </button>
        </form>
        {message ? <p className="mt-4 text-sm text-muted">{message}</p> : null}
        <Link className="mt-8 inline-block text-pine no-underline" href="/pricing">
          Back to pricing
        </Link>
      </main>
    </>
  );
}
