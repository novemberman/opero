import Link from "next/link";
import { PublicFooter } from "../components/marketing/public-footer";
import { PublicHeader } from "../components/marketing/public-header";
import { ProductVisual } from "../components/marketing/product-visual";
import { buttonClassName } from "../components/ui";

const steps = [
  {
    step: "01",
    title: "Upload statements",
    detail:
      "Bring PDF, CSV or spreadsheet financials into a secure organization workspace.",
  },
  {
    step: "02",
    title: "Review extraction",
    detail:
      "Confirm concepts, monetary scale and source evidence before anything drives analysis.",
  },
  {
    step: "03",
    title: "Run diagnostics",
    detail:
      "Profitability, liquidity, leverage, efficiency and cash-flow metrics from reviewed figures.",
  },
  {
    step: "04",
    title: "Publish with confidence",
    detail:
      "Generate readiness views, AI interpretation and immutable reports after human approval.",
  },
] as const;

const capabilities = [
  {
    title: "Document intelligence",
    detail:
      "Extraction with quantity classification, unit-scale handling and review workflows that preserve raw evidence.",
  },
  {
    title: "Financial diagnostics",
    detail:
      "Deterministic ratios and a Business Health Score — withheld when data quality or eligibility is insufficient.",
  },
  {
    title: "Grounded AI interpretation",
    detail:
      "Narratives that cite supporting figures and clearly separate calculations from interpretation.",
  },
  {
    title: "Governance & tenancy",
    detail:
      "Organization membership, role permissions, audit trails and isolated document stores.",
  },
] as const;

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
                "radial-gradient(ellipse at 15% 10%, rgba(8,127,109,0.35), transparent 50%), radial-gradient(ellipse at 85% 0%, rgba(214,168,91,0.18), transparent 40%), linear-gradient(180deg, #101d32 0%, #0c1626 100%)",
            }}
            aria-hidden
          />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:py-24">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald">
                Opero X-Ray
              </p>
              <h1 className="mt-4 max-w-xl font-display text-[2.35rem] leading-[1.12] text-balance sm:text-5xl lg:text-[3.25rem]">
                Opero
              </h1>
              <p className="mt-3 max-w-xl text-xl font-medium leading-snug text-white/90 sm:text-2xl">
                Financial intelligence you can take to the board, the bank and the next decision.
              </p>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/65">
                Upload statements, review extractions, run diagnostics and publish evidence-backed
                reports — without inventing metrics or hiding uncertainty.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className={buttonClassName({ size: "lg" })}>
                  Start free registration
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

        <section
          id="xray"
          className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20"
          aria-labelledby="xray-heading"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald">Product</p>
          <h2 id="xray-heading" className="mt-3 max-w-2xl text-3xl text-navy sm:text-4xl">
            Opero X-Ray turns financial statements into decision-ready intelligence.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-secondary">
            Built for business owners, finance professionals, accountants and lenders who need
            clarity they can defend — with source evidence, human review and transparent data
            quality.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              ["Operators", "See health, cash pressure and margin trends before they surprise you."],
              ["Finance teams", "Review extractions, correct mapping and keep an audit-ready trail."],
              ["Lenders & advisors", "Read diagnostics and reports grounded in the borrower’s files."],
            ].map(([title, detail]) => (
              <div key={title} className="border-t border-border pt-5">
                <h3 className="text-base font-semibold text-navy">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="how-it-works"
          className="border-y border-border bg-info-surface/60"
          aria-labelledby="how-heading"
        >
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald">
              How it works
            </p>
            <h2 id="how-heading" className="mt-3 text-3xl text-navy sm:text-4xl">
              From upload to published insight
            </h2>
            <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((item) => (
                <li key={item.step}>
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
          className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20"
          aria-labelledby="capabilities-heading"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald">
            Capabilities
          </p>
          <h2 id="capabilities-heading" className="mt-3 max-w-2xl text-3xl text-navy sm:text-4xl">
            Everything required for serious financial review
          </h2>
          <ul className="mt-10 grid gap-8 sm:grid-cols-2">
            {capabilities.map((item) => (
              <li key={item.title} className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-navy">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="pricing"
          className="border-t border-border bg-surface"
          aria-labelledby="pricing-heading"
        >
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald">
                  Pricing
                </p>
                <h2 id="pricing-heading" className="mt-3 text-3xl text-navy sm:text-4xl">
                  Clear commercial plans for Nigerian launch
                </h2>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-text-secondary">
                  Browse live catalog pricing for Opero X-Ray and Opero OS. Amounts are shown in
                  NGN; enterprise quotations are available on request.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 lg:justify-end">
                <Link href="/pricing" className={buttonClassName({ size: "lg" })}>
                  See full pricing
                </Link>
                <Link
                  href="/pricing/enterprise"
                  className={buttonClassName({ variant: "secondary", size: "lg" })}
                >
                  Enterprise enquiry
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-navy text-text-inverse" aria-labelledby="cta-heading">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-16 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-20">
            <div className="max-w-xl">
              <h2 id="cta-heading" className="font-display text-3xl sm:text-4xl">
                Create your Opero workspace
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                Register with email verification, join or create an organization, and start with
                document review — no fabricated scores, no shortcuts past human confirmation.
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
