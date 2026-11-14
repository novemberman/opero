import { cn } from "../../lib/cn";

export function ProgressBar({
  value,
  max = 100,
  label,
  indeterminate = false,
  className,
}: {
  value?: number;
  max?: number;
  label?: string;
  indeterminate?: boolean;
  className?: string;
}) {
  const safeMax = max <= 0 ? 100 : max;
  const pct = indeterminate ? undefined : Math.min(100, Math.max(0, ((value ?? 0) / safeMax) * 100));

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <p className="text-xs font-medium text-text-secondary">{label}</p> : null}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={indeterminate ? undefined : safeMax}
        aria-valuenow={indeterminate ? undefined : value}
        aria-label={label ?? "Progress"}
      >
        {indeterminate ? (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald motion-reduce:animate-none" />
        ) : (
          <div
            className="h-full rounded-full bg-emerald transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-5 animate-spin rounded-full border-2 border-emerald border-r-transparent motion-reduce:animate-none",
        className,
      )}
      role="status"
      aria-label={label}
    />
  );
}
