"use client";

import {
  aiAvailabilityPresentation,
  type AiAvailabilityInput,
} from "../../lib/ai-interpretation-presentation";
import { Alert, Badge } from "../ui";

export function AiAvailabilityBanner({
  availability,
  error,
}: {
  availability: AiAvailabilityInput | null;
  error?: string | null;
}) {
  if (error) {
    return (
      <Alert tone="error" title="Unable to check AI availability">
        {error}
      </Alert>
    );
  }

  const presentation = aiAvailabilityPresentation(availability);
  return (
    <div data-testid="ai-availability-banner">
      <Alert tone={presentation.tone} title={presentation.title}>
        <div className="flex flex-wrap items-center gap-2">
          <span>{presentation.body}</span>
          {"provider" in presentation && presentation.provider ? (
            <Badge tone="neutral">Provider: {presentation.provider}</Badge>
          ) : null}
        </div>
      </Alert>
    </div>
  );
}
