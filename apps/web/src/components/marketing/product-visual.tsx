/** Stylised product surface — illustrative only, not live account data. */
export function ProductVisual({ className }: { className?: string }) {
  return (
    <div
      className={className}
      role="img"
      aria-label="Illustration of Opero X-Ray financial diagnostics workspace"
    >
      <div className="overflow-hidden rounded-2xl border border-white/15 bg-[#0c1626] shadow-lg">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="ml-3 text-xs font-medium tracking-wide text-white/55">
            Opero X-Ray · Diagnostics
          </span>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-[1fr_1.15fr] sm:p-5">
          <div className="space-y-3">
            <div className="rounded-xl bg-white/5 p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-emerald">Business health</p>
              <p className="mt-2 font-data text-3xl font-semibold text-white">72</p>
              <p className="mt-1 text-xs text-white/55">Score available when data quality passes</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Gross margin", "58%"],
                ["Current ratio", "1.8×"],
                ["Cash runway", "—"],
                ["Leverage", "0.4×"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-white/5 px-3 py-2.5">
                  <p className="text-[10px] text-white/50">{label}</p>
                  <p className="mt-1 font-data text-sm font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-white/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-gold">Statement review</p>
            <div className="mt-3 space-y-2 font-data text-xs">
              {[
                ["Revenue", "144,000", "THOUSANDS", "144,000,000"],
                ["Gross profit", "84,000", "THOUSANDS", "84,000,000"],
                ["Gross margin", "58.3%", "—", "not monetary"],
              ].map(([concept, raw, scale, actual]) => (
                <div
                  key={concept}
                  className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-white/8 bg-[#101d32]/60 px-3 py-2 text-white/80"
                >
                  <div>
                    <p className="font-sans text-[11px] font-semibold text-white">{concept}</p>
                    <p className="mt-0.5 text-[10px] text-white/45">
                      raw {raw} · scale {scale}
                    </p>
                  </div>
                  <p className="self-center text-right text-[11px] text-emerald">{actual}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-white/40">
              Illustrative layout. Live scores and amounts appear only from reviewed extractions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
