import Link from "next/link";

const surfaces = [
  {
    name: "Web",
    detail: "This site. A responsive shell for the product, with a health check at /health.",
  },
  {
    name: "API",
    detail: "NestJS service on /api/v1. Environment checks, structured logs, and a health route.",
  },
  {
    name: "Worker",
    detail: "Background process connected to Redis through BullMQ. One local heartbeat job.",
  },
  {
    name: "Data",
    detail: "PostgreSQL models for organizations, users, memberships, and audit events.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <p className="text-lg tracking-tight text-ink">
            Opero
            <span className="sr-only">, Business Operating System</span>
          </p>
          <p className="rounded-full border border-line px-3 py-1 text-sm text-muted">Foundation</p>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-pine">
          Business Operating System
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl leading-tight text-ink sm:text-6xl">
          A foundation for evidence-backed operations.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Opero is the platform underneath Opero X-Ray. This build runs the web shell, the API,
          the worker, and the tenant data model. Diagnostic analysis of financial documents ships
          in a later phase.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="inline-flex min-h-11 items-center rounded-full bg-pine px-5 text-paper no-underline hover:bg-pine-dark"
            href="/register"
          >
            Create account
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-ink no-underline hover:border-ink"
            href="/login"
          >
            Sign in
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-ink no-underline hover:border-ink"
            href="/health"
          >
            Health
          </Link>
        </div>
        <section className="mt-16" aria-labelledby="surfaces-heading">
          <h2 id="surfaces-heading" className="text-2xl text-ink sm:text-3xl">
            What is running
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {surfaces.map((surface) => (
              <li key={surface.name} className="rounded-2xl border border-line bg-white/60 p-5">
                <h3 className="text-xl text-ink">{surface.name}</h3>
                <p className="mt-2 leading-relaxed text-muted">{surface.detail}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="mt-12 rounded-2xl bg-pine px-6 py-8 text-paper sm:px-8" aria-labelledby="scope-heading">
          <h2 id="scope-heading" className="text-2xl">
            Identity and tenant isolation are active in the API
          </h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-paper/90">
            Registration, sessions, organization membership, and permission checks run on the
            NestJS API. Financial document analysis remains a later phase.
          </p>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>Opero foundation environment</p>
          <p>Local services stay on loopback.</p>
        </div>
      </footer>
    </>
  );
}
