import Link from "next/link";
import type { ReactNode } from "react";

const panelPoints = [
  {
    title: "Evidence-backed diagnostics",
    detail: "Ratios and health scores come from reviewed statement figures — never invented.",
  },
  {
    title: "Tenant-isolated workspaces",
    detail: "Organizations, documents and reports stay separated with permission-aware access.",
  },
  {
    title: "Human review before decisions",
    detail: "Confirm mapping, scale and quality before publishing immutable reports.",
  },
] as const;

export function AuthShell({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-workspace">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="grid min-h-dvh lg:grid-cols-2">
        <aside className="relative hidden overflow-hidden bg-navy text-text-inverse lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12 xl:px-16">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(ellipse at 20% 0%, rgba(8,127,109,0.45), transparent 55%), radial-gradient(ellipse at 90% 80%, rgba(214,168,91,0.22), transparent 45%)",
            }}
            aria-hidden
          />
          <div className="relative">
            <Link href="/" className="font-display text-3xl text-text-inverse no-underline">
              Opero
            </Link>
            <p className="mt-8 max-w-md font-display text-3xl leading-snug text-balance xl:text-4xl">
              Financial intelligence your team can defend.
            </p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">
              Opero X-Ray turns statements into diagnostics, readiness checks and board-ready
              narratives — with source evidence attached.
            </p>
          </div>
          <ul className="relative mt-12 space-y-5">
            {panelPoints.map((point) => (
              <li key={point.title} className="max-w-md border-l-2 border-emerald/60 pl-4">
                <p className="text-sm font-semibold text-white">{point.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-white/65">{point.detail}</p>
              </li>
            ))}
          </ul>
          <p className="relative mt-12 text-xs text-white/45">
            Secure sessions · CSRF protection · Email verification required
          </p>
        </aside>

        <div className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 lg:hidden">
            <Link href="/" className="font-display text-2xl text-navy no-underline">
              Opero
            </Link>
            <Link href="/" className="text-sm font-medium text-text-secondary no-underline hover:text-emerald">
              Back to home
            </Link>
          </div>
          <main
            id="main"
            className="flex flex-1 flex-col justify-center px-5 py-10 sm:px-8 lg:px-12 xl:px-16"
          >
            <div className="mx-auto w-full max-w-md">
              <div className="rounded-2xl border border-border bg-surface p-6 shadow-md sm:p-8">
                {children}
              </div>
              {footer ? <div className="mt-6 text-center text-sm text-text-secondary">{footer}</div> : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
