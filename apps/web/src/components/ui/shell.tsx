import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

/** Desktop sidebar frame — wire routes/permissions in 9C. */
export function AppSidebar({
  className,
  brand,
  children,
  footer,
  ...props
}: HTMLAttributes<HTMLElement> & {
  brand?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <aside
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface",
        className,
      )}
      {...props}
    >
      {brand ? <div className="border-b border-border px-5 py-4">{brand}</div> : null}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Primary">
        {children}
      </nav>
      {footer ? <div className="border-t border-border px-3 py-3">{footer}</div> : null}
    </aside>
  );
}

export function SidebarLink({
  active,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLAnchorElement> & {
  active?: boolean;
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      className={cn(
        "flex min-h-10 items-center rounded-lg px-3 text-sm font-medium no-underline transition-colors",
        active ? "bg-info-surface text-emerald" : "text-text-secondary hover:bg-hover hover:text-text",
        className,
      )}
      aria-current={active ? "page" : undefined}
      {...props}
    >
      {children}
    </a>
  );
}

/** Top bar for breadcrumbs, org switcher, user menu — compose in 9C. */
export function AppTopBar({
  className,
  left,
  right,
  ...props
}: HTMLAttributes<HTMLElement> & {
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header
      className={cn(
        "flex min-h-14 items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">{left}</div>
      <div className="flex shrink-0 items-center gap-2">{right}</div>
    </header>
  );
}

export function AppShell({
  sidebar,
  topbar,
  children,
  className,
}: {
  sidebar?: ReactNode;
  topbar?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-dvh bg-workspace text-text", className)}>
      <div className="hidden md:block">{sidebar}</div>
      <div className="flex min-w-0 flex-1 flex-col">
        {topbar}
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
