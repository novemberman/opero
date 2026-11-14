import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Checkbox({
  className,
  label,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
}) {
  return (
    <label className={cn("inline-flex items-start gap-2.5 text-sm text-text", className)}>
      <input
        type="checkbox"
        className={cn(
          "mt-0.5 size-4 shrink-0 rounded border-border text-emerald",
          "focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
