import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * Accessible hover/focus tooltip using native title fallback plus a CSS overlay.
 * Prefer concise copy; keep essential information visible without relying on tooltips alone.
 */
export function Tooltip({
  content,
  children,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-xs -translate-x-1/2",
          "rounded-md bg-navy px-2.5 py-1.5 text-xs text-text-inverse opacity-0 shadow-md",
          "transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        {content}
      </span>
    </span>
  );
}

export function HelpHint({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex size-4 items-center justify-center rounded-full border border-border text-[10px] font-bold text-text-secondary",
        className,
      )}
      {...props}
    >
      ?
    </span>
  );
}
