/** Display order and labels for diagnostic score dimensions (UI only — weights come from the API). */

export const DIAGNOSTIC_DIMENSIONS = [
  "profitability",
  "liquidity",
  "leverage",
  "efficiency",
  "cash_flow",
] as const;

export type DiagnosticDimension = (typeof DIAGNOSTIC_DIMENSIONS)[number];

const LABELS: Record<DiagnosticDimension, string> = {
  profitability: "Profitability",
  liquidity: "Liquidity",
  leverage: "Leverage",
  efficiency: "Efficiency",
  cash_flow: "Cash flow",
};

const BLURBS: Record<DiagnosticDimension, string> = {
  profitability: "Margins and expense ratios derived from the income statement.",
  liquidity: "Short-term coverage of liabilities from current assets and cash.",
  leverage: "Balance-sheet leverage and interest coverage where inputs exist.",
  efficiency: "Working-capital cycle and asset-turn style measures.",
  cash_flow: "Operating and free cash-flow coverage relative to operations.",
};

export function dimensionLabel(dimension: string): string {
  if ((DIAGNOSTIC_DIMENSIONS as readonly string[]).includes(dimension)) {
    return LABELS[dimension as DiagnosticDimension];
  }
  return dimension
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function dimensionBlurb(dimension: string): string {
  if ((DIAGNOSTIC_DIMENSIONS as readonly string[]).includes(dimension)) {
    return BLURBS[dimension as DiagnosticDimension];
  }
  return "Diagnostic measures for this category.";
}

export function sortDimensions(dimensions: string[]): string[] {
  const order = new Map(DIAGNOSTIC_DIMENSIONS.map((d, i) => [d, i]));
  return [...dimensions].sort((a, b) => {
    const ai = order.get(a as DiagnosticDimension) ?? 99;
    const bi = order.get(b as DiagnosticDimension) ?? 99;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
}
