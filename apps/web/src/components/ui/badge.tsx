import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export type BadgeTone = "neutral" | "success" | "warning" | "error" | "info" | "emerald" | "gold";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-text-secondary border-border",
  success: "bg-success-surface text-success border-success/20",
  warning: "bg-warning-surface text-warning border-warning/20",
  error: "bg-error-surface text-error border-error/20",
  info: "bg-info-surface text-info border-info/20",
  emerald: "bg-emerald/10 text-emerald border-emerald/20",
  gold: "bg-gold/15 text-navy border-gold/30",
};

export function Badge({
  className,
  tone = "neutral",
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
