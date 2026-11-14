const metrics = [
  { label: "Concepts mapped", value: "REVENUE → NET", note: "Review before publish" },
  { label: "Scale handled", value: "₦'000 → NGN", note: "No double scaling" },
  { label: "Quality gated", value: "Score or —", note: "Withheld if incomplete" },
  { label: "Evidence kept", value: "Page · cell · row", note: "Source attached" },
] as const;

/** Data-led storytelling strip — descriptive, not fabricated performance claims. */
export function MetricStrip() {
  return (
    <section className="border-b border-border bg-surface" aria-label="How Opero treats financial data">
      <div className="mx-auto grid max-w-6xl gap-0 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((item, index) => (
          <div
            key={item.label}
            className={`px-5 py-6 sm:px-6 ${index > 0 ? "border-t border-border sm:border-t-0 sm:border-l" : ""}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald">{item.label}</p>
            <p className="mt-2 font-data text-lg font-semibold text-navy sm:text-xl">{item.value}</p>
            <p className="mt-1 text-xs text-text-secondary">{item.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
