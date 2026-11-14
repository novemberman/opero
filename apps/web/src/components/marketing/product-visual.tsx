import { cn } from "../../lib/cn";
import { OperoMark } from "../brand/opero-logo";

const bars = [
  { label: "FY22", h: "42%" },
  { label: "FY23", h: "58%" },
  { label: "FY24", h: "71%" },
] as const;

/** Stylised product surface — illustrative only, not live account data. */
export function ProductVisual({ className }: { className?: string }) {
  return (
    <div
      className={cn("w-full max-w-xl", className)}
      role="img"
      aria-label="Illustrative Opero X-Ray diagnostics dashboard"
    >
      <div className="overflow-hidden rounded-2xl border border-white/20 bg-[#0a1424] shadow-lg ring-1 ring-white/10">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <OperoMark className="size-7" inverse decorative />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">Opero X-Ray</p>
              <p className="text-[11px] text-white/50">Diagnostics workspace</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-gold/40 bg-gold/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gold">
            Illustrative
          </span>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[0.95fr_1.05fr] sm:gap-5 sm:p-5">
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald">
                    Business health
                  </p>
                  <p className="mt-2 font-data text-4xl font-semibold tracking-tight text-white">72</p>
                  <p className="mt-1 text-xs text-white/55">Shown when data quality passes</p>
                </div>
                <svg viewBox="0 0 64 64" className="size-14 shrink-0" aria-hidden>
                  <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
                  <circle
                    cx="32"
                    cy="32"
                    r="26"
                    fill="none"
                    stroke="#087F6D"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 26 * 0.72} ${2 * Math.PI * 26}`}
                    transform="rotate(-90 32 32)"
                  />
                </svg>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                Revenue trend
              </p>
              <div className="mt-3 flex h-24 items-end gap-3">
                {bars.map((bar) => (
                  <div key={bar.label} className="flex flex-1 flex-col items-center gap-1.5">
                    <div
                      className="w-full rounded-t-md bg-emerald/90"
                      style={{ height: bar.h }}
                      title={bar.label}
                    />
                    <span className="font-data text-[10px] text-white/50">{bar.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Gross margin", "58%", "emerald"],
                ["Current ratio", "1.8×", "white"],
                ["Cash / assets", "19%", "white"],
                ["Leverage", "0.4×", "gold"],
              ].map(([label, value, tone]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3">
                  <p className="text-[10px] text-white/50">{label}</p>
                  <p
                    className={cn(
                      "mt-1 font-data text-lg font-semibold",
                      tone === "emerald" ? "text-emerald" : tone === "gold" ? "text-gold" : "text-white",
                    )}
                  >
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
                Statement review
              </p>
              <div className="mt-3 space-y-2 font-data text-xs">
                {[
                  ["Revenue", "144,000", "×1,000", "NGN 144.0M"],
                  ["Gross profit", "84,000", "×1,000", "NGN 84.0M"],
                  ["Gross margin", "58.3%", "ratio", "Not scaled"],
                ].map(([concept, raw, scale, actual]) => (
                  <div
                    key={concept}
                    className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-white/10 bg-[#101d32]/70 px-3 py-2.5"
                  >
                    <div>
                      <p className="font-sans text-[11px] font-semibold text-white">{concept}</p>
                      <p className="mt-0.5 text-[10px] text-white/45">
                        raw {raw} · {scale}
                      </p>
                    </div>
                    <p className="self-center text-right text-[11px] font-semibold text-emerald">{actual}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="border-t border-white/10 px-4 py-2.5 text-center text-[10px] text-white/40 sm:px-5">
          Illustrative sample — not live account data. Scores appear only from reviewed extractions.
        </p>
      </div>
    </div>
  );
}
