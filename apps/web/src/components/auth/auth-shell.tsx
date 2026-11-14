import Link from "next/link";
import type { ReactNode } from "react";
import { OperoLogo, OperoMark } from "../brand/opero-logo";

const panelPoints = [
  { title: "Evidence first", detail: "Scores and ratios from reviewed figures only." },
  { title: "Isolated tenants", detail: "Organizations, documents and reports stay separated." },
  { title: "Human confirmation", detail: "Mapping and scale reviewed before publish." },
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
      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <aside className="relative hidden overflow-hidden bg-navy text-text-inverse lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12 xl:px-14">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 15% 0%, rgba(8,127,109,0.32), transparent 50%), linear-gradient(165deg, #101d32 0%, #0c1626 100%)",
            }}
            aria-hidden
          />
          <div className="relative space-y-8">
            <Link href="/" className="inline-block no-underline">
              <OperoLogo inverse markClassName="size-9" />
            </Link>
            <div>
              <p className="max-w-sm font-display text-3xl leading-snug text-balance xl:text-[2.35rem]">
                Clarity you can take to the board.
              </p>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/65">
                Opero X-Ray keeps diagnostics, readiness and reports tied to source evidence.
              </p>
            </div>
            <div className="grid max-w-sm grid-cols-3 gap-2" aria-hidden>
              {[
                ["Health", "72"],
                ["Margin", "58%"],
                ["Scale", "×1k"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3"
                >
                  <p className="text-[10px] uppercase tracking-wide text-white/45">{label}</p>
                  <p className="mt-1 font-data text-lg font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-white/40">Illustrative sample values — not live data.</p>
          </div>
          <ul className="relative mt-10 space-y-4">
            {panelPoints.map((point) => (
              <li key={point.title} className="max-w-sm border-l-2 border-emerald/70 pl-4">
                <p className="text-sm font-semibold text-white">{point.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-white/60">{point.detail}</p>
              </li>
            ))}
          </ul>
          <p className="relative mt-10 text-xs text-white/40">
            Secure sessions · CSRF protection · Email verification required
          </p>
        </aside>

        <div className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5 sm:px-5 lg:hidden">
            <Link href="/" className="no-underline" aria-label="Opero home">
              <span className="inline-flex items-center gap-2">
                <OperoMark className="size-8" decorative />
                <span className="font-display text-xl text-navy">Opero</span>
              </span>
            </Link>
            <Link
              href="/"
              className="text-sm font-medium text-text-secondary no-underline hover:text-emerald"
            >
              Home
            </Link>
          </div>
          <main
            id="main"
            className="flex flex-1 flex-col justify-center px-4 py-8 sm:px-8 sm:py-10 lg:px-12 xl:px-16"
          >
            <div className="mx-auto w-full max-w-[26rem]">
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-md sm:p-7">
                {children}
              </div>
              {footer ? (
                <div className="mt-5 text-center text-sm text-text-secondary">{footer}</div>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
