import Link from "next/link";
import { OperoLogo } from "../brand/opero-logo";

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="max-w-sm space-y-3">
          <OperoLogo markClassName="size-8" />
          <p className="text-sm leading-relaxed text-text-secondary">
            Financial intelligence for operators, finance teams and lenders — grounded in your
            statements, not invented metrics.
          </p>
        </div>
        <nav className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm" aria-label="Footer">
          <Link className="text-text-secondary no-underline hover:text-emerald" href="/#xray">
            Opero X-Ray
          </Link>
          <Link className="text-text-secondary no-underline hover:text-emerald" href="/pricing">
            Pricing
          </Link>
          <Link className="text-text-secondary no-underline hover:text-emerald" href="/register">
            Create account
          </Link>
          <Link className="text-text-secondary no-underline hover:text-emerald" href="/login">
            Sign in
          </Link>
          <Link className="text-text-secondary no-underline hover:text-emerald" href="/health">
            System health
          </Link>
          <Link
            className="text-text-secondary no-underline hover:text-emerald"
            href="/pricing/enterprise"
          >
            Enterprise
          </Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-4 text-xs text-text-secondary sm:flex-row sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} Opero. All rights reserved.</p>
          <p>Secure multi-tenant workspace · Evidence-backed diagnostics</p>
        </div>
      </div>
    </footer>
  );
}
