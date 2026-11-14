import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Input({
  className,
  label,
  hint,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}) {
  const inputId = id ?? (typeof label === "string" ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  const describedBy = [hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <label className="block space-y-1.5 text-sm text-text">
      {label ? <span className="font-medium">{label}</span> : null}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-text shadow-sm",
          "placeholder:text-text-disabled",
          "focus-visible:border-emerald focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-0 focus-visible:outline-focus/30",
          "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-disabled",
          error ? "border-error" : null,
          className,
        )}
        {...props}
      />
      {hint && !error ? (
        <span id={`${inputId}-hint`} className="block text-xs text-text-secondary">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${inputId}-error`} className="block text-xs text-error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
