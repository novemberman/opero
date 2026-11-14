import { cn } from "../../lib/cn";

type LogoProps = {
  className?: string;
  markClassName?: string;
  /** Show wordmark beside the mark */
  wordmark?: boolean;
  /** Inverse colours for navy backgrounds */
  inverse?: boolean;
};

/** Opero mark: aperture with an X-Ray scan beam — navy / emerald / gold. */
export function OperoMark({
  className,
  inverse = false,
  decorative = false,
}: {
  className?: string;
  inverse?: boolean;
  /** Hide from AT when paired with visible wordmark text */
  decorative?: boolean;
}) {
  const navy = inverse ? "#F7F9FC" : "#101D32";
  const emerald = "#087F6D";
  const gold = "#D6A85B";
  const field = inverse ? "#101D32" : "#F7F9FC";

  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "Opero"}
    >
      <rect width="40" height="40" rx="10" fill={navy} />
      <circle cx="20" cy="20" r="11" stroke={field} strokeWidth="2.25" />
      <circle cx="20" cy="20" r="4.25" fill={emerald} />
      <rect x="6" y="18.25" width="28" height="3.5" rx="1.75" fill={emerald} opacity="0.92" />
      <rect x="29" y="16.5" width="5" height="7" rx="1.5" fill={gold} />
    </svg>
  );
}

export function OperoLogo({
  className,
  markClassName,
  wordmark = true,
  inverse = false,
}: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <OperoMark className={cn("size-8", markClassName)} inverse={inverse} decorative={wordmark} />
      {wordmark ? (
        <span
          className={cn(
            "font-display text-[1.35rem] leading-none tracking-tight",
            inverse ? "text-text-inverse" : "text-navy",
          )}
        >
          Opero
        </span>
      ) : null}
    </span>
  );
}
