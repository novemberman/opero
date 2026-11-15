import Link from "next/link";
import { OperoLogo, OperoMark } from "../components/brand/opero-logo";
import { MetricStrip } from "../components/marketing/metric-strip";
import { PublicFooter } from "../components/marketing/public-footer";
import { PublicHeader } from "../components/marketing/public-header";
import { ProductVisual } from "../components/marketing/product-visual";
import { buttonClassName } from "../components/ui";

const steps = [
  { step: "01", title: "Upload", detail: "PDF, CSV or spreadsheet into a secure workspace." },
  { step: "02", title: "Review", detail: "Confirm concepts, scale and source evidence." },
  { step: "03", title: "Diagnose", detail: "Profitability, liquidity, leverage and cash flow." },
  { step: "04", title: "Publish", detail: "Readiness, AI narrative and immutable reports." },
] as const;

const capabilities = [
  {
    title: "Document intelligence",
    detail: "Quantity classes, unit scale and evidence preserved through review.",
    visual: "extract",
  },
  {
    title: "Financial diagnostics",
    detail: "Deterministic ratios. Health score withheld when data is insufficient.",
    visual: "score",
  },
  {
    title: "Grounded AI",
    detail: "Narratives cite figures and separate calculation from interpretation.",
    visual: "ai",
  },
  {
    title: "Governance",
    detail: "Tenancy, roles, audit trails and isolated document stores.",
    visual: "gov",
  },
] as const;

function CapabilityGlyph({ kind }: { kind: (typeof capabilities)[number]["visual"] }) {
  if (kind === "extract") {
    return (
      <div className="font-data space-y-1.5 text-[11px]" aria-hidden>
        <div className="flex justify-between rounded-md bg-info-surface px-2 py-1.5 text-navy">
          <span>Revenue</span>
          <span className="text-navy">mapped</span>
        </div>
        <div className="flex justify-between rounded-md bg-workspace px-2 py-1.5 text-text-secondary">
          <span>Margin %</span>
          <span>excluded</span>
        </div>
      </div>
    );
  }
  if (kind === "score") {
    return (
      <div className="flex items-center gap-3" aria-hidden>
        <svg viewBox="0 0 56 56" className="size-12">
          <circle cx="28" cy="28" r="22" fill="none" stroke="#EAF2F8" strokeWidth="5" />
          <circle
            cx="28"
            cy="28"
            r="22"
            fill="none"
            stroke="#D6A85B"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 22 * 0.7} ${2 * Math.PI * 22}`}
            transform="rotate(-90 28 28)"
          />
        </svg>
        <div>
          <p className="font-data text-2xl font-semibold text-navy">70</p>
          <p className="text-[10px] text-text-secondary">or withheld</p>
        </div>
      </div>
    );
  }
  if (kind === "ai") {
    return (
      <div className="space-y-1.5 text-[11px]" aria-hidden>
        <p className="rounded-md border border-border bg-workspace px-2 py-1.5 text-text-secondary">
          Calculation · deterministic
        </p>
        <p className="rounded-md border border-border bg-ice px-2 py-1.5 text-navy">
          Interpretation · labelled AI
        </p>
      </div>
    );
  }
  return (
    <div className="flex gap-1.5" aria-hidden>
      {["Owner", "Analyst", "Viewer"].map((role) => (
        <span
          key={role}
          className="rounded-full border border-border bg-workspace px-2 py-1 text-[10px] font-medium text-navy"
        >
          {role}
        </span>
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <PublicHeader />
      <main id="main">
        <section className="relative overflow-hidden border-b border-border bg-navy text-text-inverse">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 8% 0%, rgba(214,168,91,0.16), transparent 42%), radial-gradient(ellipse at 92% 18%, rgba(234,242,248,0.1), transparent 46%), linear-gradient(180deg, #101d32 0%, #0c1626 100%)",
            }}
            aria-hidden
          />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-12 lg:py-20">
            <div>
              <div className="flex items-center gap-3">
                <OperoMark className="size-10" inverse />
                <p className="brand-kicker-inverse">Opero X-Ray</p>
              </div>
              <h1 className="mt-6 max-w-lg font-display text-[2.5rem] leading-[1.08] text-balance text-white sm:text-5xl lg:text-[3.35rem]">
                See the truth in your numbers.
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-white/70 sm:text-lg">
                Opero turns statements into reviewed diagnostics and board-ready reports — with
                evidence attached, and no invented metrics.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className={buttonClassName({ size: "lg" })}>
                  Create account
                </Link>
                <Link
                  href="/pricing"
                  className={buttonClassName({
                    variant: "secondary",
                    size: "lg",
                    className: "border-white/25 bg-transparent text-white hover:bg-white/10",
                  })}
                >
                  View pricing
                </Link>
              </div>
            </div>
            <ProductVisual className="lg:justify-self-end" />
          </div>
        </section>

        <MetricStrip />

        <section
          id="xray"
          className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16"
          aria-labelledby="xray-heading"
        >
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-end">
            <div>
              <p className="brand-kicker">Product</p>
              <h2 id="xray-heading" className="mt-3 text-3xl text-navy sm:text-4xl">
                Built for decisions you must defend.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-text-secondary sm:text-base">
              Operators, finance teams and lenders use the same evidence trail — from extraction
              review through diagnostics to published reports.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ["Operators", "Health, cash and margin signals before they surprise you."],
              ["Finance teams", "Correct mapping, confirm scale, keep an audit trail."],
              ["Lenders", "Diagnostics grounded in the borrower’s own files."],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <h3 className="text-base font-semibold text-navy">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="how-it-works"
          className="border-y border-border bg-info-surface/70"
          aria-labelledby="how-heading"
        >
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
            <p className="brand-kicker">How it works</p>
            <h2 id="how-heading" className="mt-3 text-3xl text-navy sm:text-4xl">
              Four steps. Human confirmation kept.
            </h2>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((item) => (
                <li
                  key={item.step}
                  className="rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-sm"
                >
                  <p className="font-data text-sm font-semibold text-gold">{item.step}</p>
                  <h3 className="mt-2 text-lg font-semibold text-navy">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="capabilities"
          className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16"
          aria-labelledby="capabilities-heading"
        >
          <p className="brand-kicker">Capabilities</p>
          <h2 id="capabilities-heading" className="mt-3 max-w-xl text-3xl text-navy sm:text-4xl">
            Serious review, without the noise.
          </h2>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2">
            {capabilities.map((item) => (
              <li
                key={item.title}
                className="grid gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:grid-cols-[1fr_8.5rem] sm:items-center"
              >
                <div>
                  <h3 className="text-lg font-semibold text-navy">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.detail}</p>
                </div>
                <CapabilityGlyph kind={item.visual} />
              </li>
            ))}
          </ul>
        </section>

        <section
          id="pricing"
          className="border-t border-border bg-surface"
          aria-labelledby="pricing-heading"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-14 sm:px-8 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p className="brand-kicker">Pricing</p>
              <h2 id="pricing-heading" className="mt-3 text-3xl text-navy sm:text-4xl">
                Transparent NGN launch plans
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary sm:text-base">
                Live catalog for Opero X-Ray and Opero OS. Enterprise quotations on request.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/pricing" className={buttonClassName({ size: "lg" })}>
                See pricing
              </Link>
              <Link
                href="/pricing/enterprise"
                className={buttonClassName({ variant: "secondary", size: "lg" })}
              >
                Enterprise
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-navy text-text-inverse" aria-labelledby="cta-heading">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-16">
            <div className="max-w-lg">
              <div className="mb-4">
                <OperoLogo inverse markClassName="size-9" />
              </div>
              <h2 id="cta-heading" className="font-display text-3xl text-white sm:text-4xl">
                Start with evidence, not guesswork.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                Verify email, open an organization, and review documents before any score is shown.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/register" className={buttonClassName({ size: "lg" })}>
                Create account
              </Link>
              <Link
                href="/login"
                className={buttonClassName({
                  variant: "secondary",
                  size: "lg",
                  className: "border-white/25 bg-transparent text-white hover:bg-white/10",
                })}
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
