export type AiAvailabilityInput = {
  provider: string;
  simulated: boolean;
  shareStructuredContext: boolean;
  available: boolean;
  reason: string | null;
};

export type AiRunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "UNAVAILABLE" | string;

export const AI_GROUNDING_REASON_TEXT: Record<string, string> = {
  NO_REFERENCES: "cites no metric or finding",
  UNKNOWN_METRIC_CODE: "cites a metric that is not in this diagnostic",
  UNKNOWN_FINDING_ID: "cites a finding that is not in this diagnostic",
  UNSUPPORTED_NUMBER: "quotes a figure that is not in the diagnostic facts it rests on",
  CONTRADICTORY_NUMBER: "quotes a figure that contradicts a cited diagnostic metric",
  RESTRICTED_LANGUAGE: "uses audit, credit-rating or insolvency wording",
};

export function aiAvailabilityPresentation(availability: AiAvailabilityInput | null) {
  if (!availability) {
    return {
      kind: "unknown" as const,
      title: "AI availability unknown",
      body: "Could not confirm whether an AI interpretation provider is configured.",
      tone: "warning" as const,
    };
  }
  if (!availability.available) {
    return {
      kind: "unavailable" as const,
      title: "AI interpretation unavailable",
      body:
        availability.reason ??
        "The AI provider is not available. Diagnostics, readiness and reports work without it.",
      tone: "warning" as const,
      provider: availability.provider,
    };
  }
  return {
    kind: availability.simulated ? ("simulated" as const) : ("live" as const),
    title: availability.simulated ? "Simulated interpretation provider" : "AI provider available",
    body: availability.simulated
      ? "Text is assembled by fixed rules from diagnostic results and labelled as simulated — not live model output."
      : `Structured diagnostic results for the selected run are sent to ${availability.provider}. Uploaded files are never sent.`,
    tone: availability.simulated ? ("info" as const) : ("success" as const),
    provider: availability.provider,
  };
}

export function aiRunStatusPresentation(status: AiRunStatus) {
  switch (status) {
    case "QUEUED":
    case "RUNNING":
      return {
        label: status === "QUEUED" ? "Queued" : "Generating",
        tone: "info" as const,
        body: "The draft is being generated from deterministic diagnostic outputs. This page refreshes automatically.",
      };
    case "SUCCEEDED":
      return {
        label: "Draft ready",
        tone: "success" as const,
        body: "AI-generated narrative over computed metrics and findings. Treat as a draft for human review — not a source of new figures.",
      };
    case "FAILED":
      return {
        label: "Failed",
        tone: "error" as const,
        body: "The provider did not return a usable draft. No narrative was stored.",
      };
    case "UNAVAILABLE":
      return {
        label: "Unavailable",
        tone: "warning" as const,
        body: "The AI provider could not be reached. No draft was produced; the diagnostic is unaffected.",
      };
    default:
      return {
        label: status,
        tone: "neutral" as const,
        body: "Interpretation status from the backend.",
      };
  }
}

export function formatGroundingReasons(reasons: string[] | undefined): string {
  if (!reasons?.length) return "flagged by grounding check";
  return reasons.map((reason) => AI_GROUNDING_REASON_TEXT[reason] ?? reason).join("; ");
}
