export type NarrativeText = {
  summary: string;
  keyObservations: string[];
  risks: string[];
  limitations: string[];
};

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Reads the reader-facing text of a stored narrative. Claims are not part of it. */
export function narrativeText(value: unknown): NarrativeText {
  const narrative = (value ?? {}) as Record<string, unknown>;
  return {
    summary: typeof narrative.summary === "string" ? narrative.summary : "",
    keyObservations: stringList(narrative.keyObservations),
    risks: stringList(narrative.risks),
    limitations: stringList(narrative.limitations),
  };
}
