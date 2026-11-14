import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 sm:px-8",
        className,
      )}
    >
      <h3 className="text-base font-semibold text-text">{title}</h3>
      {description ? <p className="max-w-prose text-sm text-text-secondary">{description}</p> : null}
      {action}
    </div>
  );
}
