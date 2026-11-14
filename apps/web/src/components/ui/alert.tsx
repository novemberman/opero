import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export type AlertTone = "info" | "success" | "warning" | "error";

const tones: Record<AlertTone, string> = {
  info: "border-info/25 bg-info-surface text-navy",
  success: "border-success/25 bg-success-surface text-navy",
  warning: "border-warning/25 bg-warning-surface text-navy",
  error: "border-error/30 bg-error-surface text-navy",
};

const labels: Record<AlertTone, string> = {
  info: "Information",
  success: "Success",
  warning: "Warning",
  error: "Error",
};

export function Alert({
  className,
  tone = "info",
  title,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone], className)}
      {...props}
    >
      <p className="font-semibold">
        <span className="sr-only">{labels[tone]}: </span>
        {title ?? labels[tone]}
      </p>
      {children ? <div className="mt-1 text-text-secondary [&_a]:text-emerald [&_a]:underline">{children}</div> : null}
    </div>
  );
}
