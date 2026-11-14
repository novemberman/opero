"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export type TabItem = {
  id: string;
  label: ReactNode;
  panel: ReactNode;
  disabled?: boolean;
};

export function Tabs({
  items,
  defaultTabId,
  className,
}: {
  items: TabItem[];
  defaultTabId?: string;
  className?: string;
}) {
  const baseId = useId();
  const [active, setActive] = useState(defaultTabId ?? items[0]?.id);

  return (
    <div className={cn("space-y-4", className)}>
      <div role="tablist" aria-label="Sections" className="flex flex-wrap gap-1 border-b border-border">
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              disabled={item.disabled}
              tabIndex={selected ? 0 : -1}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
                selected
                  ? "border-emerald text-emerald"
                  : "border-transparent text-text-secondary hover:text-text",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              onClick={() => setActive(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== active}
          className="text-sm text-text"
        >
          {item.panel}
        </div>
      ))}
    </div>
  );
}
