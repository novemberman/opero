export type NarrativeText = {
  summary: string;
  keyObservations: string[];
  risks: string[];
  limitations: string[];
  recommendations: string[];
  profitabilityInterpretation: string;
  liquidityInterpretation: string;
  solvencyInterpretation: string;
  efficiencyInterpretation: string;
  cashFlowInterpretation: string;
  dataQualityExplanation: string;
  trendCommentary: string;
};

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Reads the reader-facing text of a stored narrative. Claims are not part of it. */
export function narrativeText(value: unknown): NarrativeText {
  const narrative = (value ?? {}) as Record<string, unknown>;
  return {
    summary: typeof narrative.summary === "string" ? narrative.summary : "",
    keyObservations: stringList(narrative.keyObservations),
    risks: stringList(narrative.risks),
    limitations: stringList(narrative.limitations),
    recommendations: stringList(narrative.recommendations),
    profitabilityInterpretation: optionalString(narrative.profitabilityInterpretation),
    liquidityInterpretation: optionalString(narrative.liquidityInterpretation),
    solvencyInterpretation: optionalString(narrative.solvencyInterpretation),
    efficiencyInterpretation: optionalString(narrative.efficiencyInterpretation),
    cashFlowInterpretation: optionalString(narrative.cashFlowInterpretation),
    dataQualityExplanation: optionalString(narrative.dataQualityExplanation),
    trendCommentary: optionalString(narrative.trendCommentary),
  };
}
