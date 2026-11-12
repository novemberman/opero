/**
 * Detect reporting metadata from document text without inventing values.
 * Ambiguous signals produce warnings and null/ACTUAL defaults.
 */

export function detectUnitScale(text: string): {
  unitScale: "ACTUAL" | "THOUSANDS" | "MILLIONS";
  warning?: string;
} {
  const lower = text.toLowerCase();
  const thousands = /in\s+thousands|\$'?000\b|amounts?\s+in\s+thousands/.test(lower);
  const millions = /in\s+millions|\$'?m\b|amounts?\s+in\s+millions/.test(lower);
  if (thousands && millions) {
    return {
      unitScale: "ACTUAL",
      warning: "Ambiguous unit scale (thousands and millions both mentioned); left as ACTUAL",
    };
  }
  if (millions) return { unitScale: "MILLIONS" };
  if (thousands) return { unitScale: "THOUSANDS" };
  return { unitScale: "ACTUAL" };
}

export function detectCurrencies(text: string): {
  currency: string | null;
  warning?: string;
} {
  const found = new Set<string>();
  if (text.includes("€") || /\bEUR\b/i.test(text)) found.add("EUR");
  if (text.includes("£") || /\bGBP\b/i.test(text)) found.add("GBP");
  if (text.includes("$") || /\bUSD\b/i.test(text)) found.add("USD");
  if (found.size === 0) return { currency: null };
  if (found.size > 1) {
    return {
      currency: null,
      warning: `Ambiguous currencies detected (${[...found].join(", ")}); currency left unset`,
    };
  }
  return { currency: [...found][0]! };
}

export function detectPeriodLabel(text: string): {
  periodLabel: string | null;
  warning?: string;
} {
  const matches = [
    ...text.matchAll(
      /\b(?:for the (?:year|period|quarter) ended|year ended|period ended|FY\s*\d{4}|Q[1-4]\s+\d{4})\b[^.\n]{0,40}/gi,
    ),
  ].map((m) => m[0].trim());
  const unique = [...new Set(matches.map((m) => m.replace(/\s+/g, " ")))];
  if (unique.length === 0) return { periodLabel: null };
  if (unique.length > 1) {
    return {
      periodLabel: null,
      warning: `Ambiguous reporting periods detected (${unique.slice(0, 3).join(" | ")}); period left unset`,
    };
  }
  return { periodLabel: unique[0]!.slice(0, 120) };
}

export function warnDuplicateNormalizedValues(
  lines: Array<{ concept: string; normalizedValue: string | null }>,
): string[] {
  const warnings: string[] = [];
  const seen = new Map<string, number>();
  for (const line of lines) {
    if (!line.normalizedValue || line.concept === "UNMAPPED") continue;
    const key = `${line.concept}:${line.normalizedValue}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) {
      warnings.push(`Duplicate mapped figure ${key} appeared ${count} times`);
    }
  }
  return warnings;
}
