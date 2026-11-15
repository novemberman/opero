"use client";

import { groupChecklist } from "../../lib/readiness-presentation";
import { Badge, Card, CardHeader } from "../ui";

export type ChecklistItem = {
  id: string;
  label: string;
  passed: boolean;
  required: boolean;
  detail?: string;
};

export function ReadinessChecklist({ items }: { items: ChecklistItem[] }) {
  const groups = groupChecklist(items);

  return (
    <Card data-testid="readiness-checklist">
      <CardHeader
        title="Outstanding requirements"
        description="Required checks gate report creation when failed. Recommended checks surface quality gaps."
      />
      <ul className="mt-4 divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium text-navy">{item.label}</p>
              <p className="mt-0.5 text-sm text-text-secondary">
                {item.required ? "Required" : "Recommended"}
                {item.detail ? ` · ${item.detail}` : ""}
              </p>
            </div>
            <Badge tone={item.passed ? "success" : item.required ? "error" : "warning"}>
              {item.passed ? "Passed" : "Not passed"}
            </Badge>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-text-secondary">
        {groups.requiredFailed.length} required open · {groups.optionalFailed.length} recommended
        open
      </p>
    </Card>
  );
}
