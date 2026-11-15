import Link from "next/link";

const LINKS = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/financial-disclaimers", label: "Financial disclaimers" },
  { href: "/legal/payments", label: "Payments & refunds" },
] as const;

export function LegalNav() {
  return (
    <nav
      className="mt-6 flex flex-wrap gap-x-4 gap-y-2 border-b border-border pb-4 text-sm"
      aria-label="Legal documents"
    >
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="font-medium text-emerald no-underline hover:underline"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function LegalLinksInline({ className = "" }: { className?: string }) {
  return (
    <p className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs ${className}`}>
      {LINKS.map((link, index) => (
        <span key={link.href} className="inline-flex items-center gap-3">
          {index > 0 ? <span className="text-border" aria-hidden>
            ·
          </span> : null}
          <Link href={link.href} className="text-text-secondary no-underline hover:text-emerald">
            {link.label}
          </Link>
        </span>
      ))}
    </p>
  );
}
