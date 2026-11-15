"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthNav } from "../auth-nav";
import { OperoLogo } from "../brand/opero-logo";
import { cn } from "../../lib/cn";

const links = [
  { href: "/#xray", label: "X-Ray" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#capabilities", label: "Capabilities" },
  { href: "/pricing", label: "Pricing" },
] as const;

export function PublicHeader({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-border/80 bg-workspace/90 backdrop-blur-sm">
      <div
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 sm:px-8",
          compact ? "py-3.5" : "py-4",
        )}
      >
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="no-underline" aria-label="Opero home">
            <OperoLogo markClassName="size-8" />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Product">
            {links.map((link) => {
              const active =
                link.href === "/pricing" ? pathname?.startsWith("/pricing") : false;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-medium no-underline transition-colors",
                    active
                      ? "bg-info-surface text-navy"
                      : "text-text-secondary hover:text-navy",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <AuthNav />
      </div>
    </header>
  );
}
