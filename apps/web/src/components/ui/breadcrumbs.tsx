import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type BreadcrumbItem = {
  label: ReactNode;
  href?: string;
};

export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn("text-sm text-text-secondary", className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={index} className="inline-flex items-center gap-1.5">
              {index > 0 ? <span aria-hidden className="text-border-strong">/</span> : null}
              {item.href && !last ? (
                <Link href={item.href} className="font-medium text-text no-underline hover:text-emerald">
                  {item.label}
                </Link>
              ) : (
                <span className={cn(last ? "font-semibold text-text" : null)} aria-current={last ? "page" : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
