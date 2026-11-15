"use client";

import { readinessStatusPresentation } from "../../lib/readiness-presentation";
import { Alert, Badge, Card, CardHeader } from "../ui";

export function ReadinessStatusPanel({
  status,
  createdAt,
  documentCount,
  blockingReasons,
}: {
  status: string;
  createdAt: string;
  documentCount: number;
  blockingReasons?: string[] | null;
}) {
  const presentation = readinessStatusPresentation(status);

  return (
    <Card data-testid="readiness-status-panel" data-readiness-status={status}>
      <CardHeader
        title={presentation.headline}
        description={presentation.explanation}
        action={<Badge tone={presentation.tone}>{status.replaceAll("_", " ")}</Badge>}
      />
      <p className="mt-4 text-sm text-text-secondary">
        Assessed {new Date(createdAt).toLocaleString()} · {documentCount} document
        {documentCount === 1 ? "" : "s"}
      </p>
      {blockingReasons && blockingReasons.length > 0 ? (
        <div className="mt-4">
          <Alert tone="error" title="Blocking reasons">
            <ul className="list-disc space-y-1 pl-5">
              {blockingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}
    </Card>
  );
}
