import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

const iconClass = "size-4 shrink-0";

function Svg({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconClass, className)}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function NavIcon({ id, className }: { id: string; className?: string }) {
  switch (id) {
    case "overview":
      return (
        <Svg className={className}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </Svg>
      );
    case "documents":
      return (
        <Svg className={className}>
          <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6M9 17h4" />
        </Svg>
      );
    case "diagnostics":
      return (
        <Svg className={className}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l2.5 2.5" />
        </Svg>
      );
    case "readiness":
      return (
        <Svg className={className}>
          <path d="M5 12l4 4L19 6" />
        </Svg>
      );
    case "reconciliations":
      return (
        <Svg className={className}>
          <path d="M7 7h10M7 12h10M7 17h6" />
          <path d="M17 15l2 2 3-3" />
        </Svg>
      );
    case "ai":
      return (
        <Svg className={className}>
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
        </Svg>
      );
    case "reports":
      return (
        <Svg className={className}>
          <path d="M4 19V5M4 19h16" />
          <path d="M8 16V9M12 16v-5M16 16V7" />
        </Svg>
      );
    case "billing":
      return (
        <Svg className={className}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
        </Svg>
      );
    case "members":
      return (
        <Svg className={className}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 19a6 6 0 0 1 12 0" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M15.5 19a4.5 4.5 0 0 1 5.5-4.2" />
        </Svg>
      );
    case "settings":
      return (
        <Svg className={className}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </Svg>
      );
    default:
      return (
        <Svg className={className}>
          <circle cx="12" cy="12" r="3" />
        </Svg>
      );
  }
}
