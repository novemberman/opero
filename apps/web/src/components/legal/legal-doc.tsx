import Link from "next/link";
import type { ReactNode } from "react";
import { PublicFooter } from "../marketing/public-footer";
import { OperoLogo } from "../brand/opero-logo";
import { LegalNav } from "./legal-nav";

export function LegalDoc({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-workspace">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="no-underline" aria-label="Opero home">
            <OperoLogo markClassName="size-8" />
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-text-secondary no-underline hover:text-emerald"
          >
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-copper">
          Draft — not approved production policy
        </p>
        <h1 className="mt-2 font-display text-4xl text-ink text-balance">{title}</h1>
        <p className="mt-4 rounded-xl border border-copper/30 bg-copper/5 px-4 py-3 text-sm leading-relaxed text-ink">
          This page is an engineering draft for an invitation-only pilot. It is{" "}
          <strong>not</strong> final legal advice, <strong>not</strong> an approved production
          policy, and does <strong>not</strong> create a mandatory click-wrap or consent
          obligation. A qualified Nigerian legal practitioner must review and approve final text
          before any mandatory customer consent or public launch. Bracketed placeholders such as{" "}
          <code className="font-data text-xs">[OPERATOR_LEGAL_NAME]</code> require owner approval
          and must not be treated as confirmed corporate identity.
        </p>
        <LegalNav />
        <article className="prose-legal mt-8 space-y-6 text-sm leading-relaxed text-text-secondary [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-ink [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-ink [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_strong]:text-ink">
          {children}
        </article>
        <p className="mt-10 text-xs text-muted">
          Initial governing jurisdiction draft: Federal Republic of Nigeria. Last updated for
          engineering draft purposes: 15 November 2026.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
