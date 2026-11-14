"use client";

import Link from "next/link";
import { useState } from "react";
import { PublicFooter } from "../../../components/marketing/public-footer";
import { PublicHeader } from "../../../components/marketing/public-header";
import { Alert, Button, Input, buttonClassName } from "../../../components/ui";
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
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <PublicHeader />
      <main id="main" className="bg-workspace">
        <section className="mx-auto max-w-xl px-5 py-12 sm:px-8 sm:py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald">Enterprise</p>
          <h1 className="mt-3 font-display text-4xl text-navy">Request a quotation</h1>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            Custom quotation for larger teams. This form does not charge a card and does not start a
            subscription.
          </p>
          <form className="mt-8 space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm" onSubmit={onSubmit}>
            <Input label="Contact name" name="contactName" autoComplete="name" required />
            <Input
              label="Work email"
              name="contactEmail"
              type="email"
              autoComplete="email"
              required
            />
            <Input label="Company name" name="companyName" autoComplete="organization" required />
            <label className="block space-y-1.5 text-sm text-text">
              <span className="font-medium">Message</span>
              <textarea
                className="min-h-28 w-full rounded-lg border border-border bg-surface px-3 py-2 text-text shadow-sm focus-visible:border-emerald focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-0 focus-visible:outline-focus/30"
                name="message"
                rows={4}
              />
            </label>
            {status === "error" && message ? (
              <Alert tone="error" title="Submission failed">
                {message}
              </Alert>
            ) : null}
            {status === "sent" && message ? (
              <Alert tone="success" title="Request received">
                {message}
              </Alert>
            ) : null}
            <Button type="submit" loading={status === "sending"} disabled={status === "sent"}>
              Submit enquiry
            </Button>
          </form>
          <p className="mt-6 text-sm text-text-secondary">
            Prefer self-serve?{" "}
            <Link href="/pricing" className="font-medium text-emerald no-underline hover:underline">
              View standard pricing
            </Link>
            {" · "}
            <Link href="/register" className={buttonClassName({ variant: "ghost", size: "sm", className: "inline px-0" })}>
              Create account
            </Link>
          </p>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
