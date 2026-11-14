import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Select({
  className,
  label,
  hint,
  error,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  const selectId = id ?? (typeof label === "string" ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <label className="block space-y-1.5 text-sm text-text">
      {label ? <span className="font-medium">{label}</span> : null}
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        className={cn(
          "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-text shadow-sm",
          "focus-visible:border-emerald focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-0 focus-visible:outline-focus/30",
          "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-disabled",
          error ? "border-error" : null,
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {hint && !error ? <span className="block text-xs text-text-secondary">{hint}</span> : null}
      {error ? (
        <span className="block text-xs text-error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
