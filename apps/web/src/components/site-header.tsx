import Link from "next/link";

export function SiteHeader({ mark = "Identity" }: { mark?: string }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link className="text-lg tracking-tight text-ink no-underline" href="/">
          Opero
        </Link>
        <p className="rounded-full border border-line px-3 py-1 text-sm text-muted">{mark}</p>
      </div>
    </header>
  );
}
