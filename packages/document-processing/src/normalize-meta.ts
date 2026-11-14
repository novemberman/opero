/**
 * Detect reporting metadata from document text without inventing values.
 * Ambiguous signals produce warnings and require human confirmation for scale.
 */

export type UnitScaleId = "ACTUAL" | "THOUSANDS" | "MILLIONS";
export type ScaleConfidenceId = "HIGH" | "MEDIUM" | "LOW" | "AMBIGUOUS" | "UNKNOWN";

export type UnitScaleDetection = {
  unitScale: UnitScaleId;
  confidence: ScaleConfidenceId;
  requiresReview: boolean;
  matchedText: string | null;
  warning?: string;
};

const THOUSANDS_PATTERNS: RegExp[] = [
  /amounts?\s+in\s+thousands/i,
  /expressed\s+in\s+thousands/i,
  /figures?\s+(?:are\s+)?(?:expressed\s+)?in\s+thousands/i,
  /in\s+thousands(?:\s+of)?/i,
  /₦\s*'?000\b/i,
  /ngn\s*'?000\b/i,
  /naira\s*'?000\b/i,
  /₦\s*thousands?/i,
  /ngn\s+thousands?/i,
  /\$'?000\b/i,
  /\b'000\b/,
];

const MILLIONS_PATTERNS: RegExp[] = [
  /amounts?\s+in\s+millions/i,
  /expressed\s+in\s+millions/i,
  /figures?\s+(?:are\s+)?(?:expressed\s+)?in\s+millions/i,
  /in\s+millions(?:\s+of)?/i,
  /₦\s*millions?/i,
  /ngn\s+millions?/i,
  /naira\s+millions?/i,
  /\$'?m\b/i,
  /\bmillion\b/i,
];

const ACTUAL_PATTERNS: RegExp[] = [
  /actual\s+amounts?/i,
  /amounts?\s+in\s+(?:actual\s+)?units/i,
  /figures?\s+in\s+units/i,
  /unless\s+otherwise\s+stated,\s*amounts?\s+are\s+in\s+(?:ngn|naira|₦)/i,
];

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0];
  }
  return null;
}

export function detectUnitScale(text: string): UnitScaleDetection {
  const thousandsHit = firstMatch(text, THOUSANDS_PATTERNS);
  const millionsHit = firstMatch(text, MILLIONS_PATTERNS);
  const actualHit = firstMatch(text, ACTUAL_PATTERNS);

  if (thousandsHit && millionsHit) {
    return {
      unitScale: "ACTUAL",
      confidence: "AMBIGUOUS",
      requiresReview: true,
      matchedText: `${thousandsHit} | ${millionsHit}`,
      warning:
        "Ambiguous unit scale (thousands and millions both mentioned); left as ACTUAL pending review — multiplier not applied",
    };
  }
  if (millionsHit) {
    return {
      unitScale: "MILLIONS",
      confidence: /₦|ngn|naira/i.test(millionsHit) ? "HIGH" : "MEDIUM",
      requiresReview: false,
      matchedText: millionsHit,
    };
  }
  if (thousandsHit) {
    return {
      unitScale: "THOUSANDS",
      confidence: /₦|ngn|naira|'000/i.test(thousandsHit) ? "HIGH" : "MEDIUM",
      requiresReview: false,
      matchedText: thousandsHit,
    };
  }
  if (actualHit) {
    return {
      unitScale: "ACTUAL",
      confidence: "MEDIUM",
      requiresReview: false,
      matchedText: actualHit,
    };
  }
  return {
    unitScale: "ACTUAL",
    confidence: "UNKNOWN",
    requiresReview: true,
    matchedText: null,
    warning: "No explicit monetary unit label found; scale left as ACTUAL pending confirmation",
  };
}

export function detectCurrencies(text: string): {
  currency: string | null;
  confidence: ScaleConfidenceId;
  warning?: string;
} {
  const found = new Set<string>();
  if (text.includes("€") || /\bEUR\b/i.test(text)) found.add("EUR");
  if (text.includes("£") || /\bGBP\b/i.test(text)) found.add("GBP");
  // Prefer explicit ISO codes over lone "$" which is ambiguous internationally.
  if (/\bUSD\b/i.test(text) || /US\$/.test(text)) found.add("USD");
  else if (text.includes("$") && !/₦|NGN|naira/i.test(text)) found.add("USD");
  if (text.includes("₦") || /\bNGN\b/i.test(text) || /\bnaira\b/i.test(text)) found.add("NGN");

  if (found.size === 0) return { currency: null, confidence: "UNKNOWN" };
  if (found.size > 1) {
    return {
      currency: null,
      confidence: "AMBIGUOUS",
      warning: `Ambiguous currencies detected (${[...found].join(", ")}); currency left unset`,
    };
  }
  return { currency: [...found][0]!, confidence: "HIGH" };
}

export function detectPeriodLabel(text: string): {
  periodLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  warning?: string;
} {
  const matches = [
    ...text.matchAll(
      /\b(?:for the (?:year|period|quarter) ended|year ended|period ended|as at|as of|FY\s*\d{4}|Q[1-4]\s+\d{4})\b[^.\n]{0,60}/gi,
    ),
  ].map((m) => m[0].trim());
  const unique = [...new Set(matches.map((m) => m.replace(/\s+/g, " ")))];
  if (unique.length === 0) {
    return { periodLabel: null, periodStart: null, periodEnd: null };
  }
  if (unique.length > 1) {
    return {
      periodLabel: null,
      periodStart: null,
      periodEnd: null,
      warning: `Ambiguous reporting periods detected (${unique.slice(0, 3).join(" | ")}); period left unset`,
    };
  }
  const periodLabel = unique[0]!.slice(0, 120);
  const end = parsePeriodEndDate(periodLabel);
  return {
    periodLabel,
    periodStart: end ? inferPeriodStart(periodLabel, end) : null,
    periodEnd: end,
  };
}

function parsePeriodEndDate(label: string): string | null {
  const iso = label.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = label.match(
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2}|19\d{2})\b/i,
  );
  if (dmy) {
    const months: Record<string, string> = {
      january: "01",
      february: "02",
      march: "03",
      april: "04",
      may: "05",
      june: "06",
      july: "07",
      august: "08",
      september: "09",
      october: "10",
      november: "11",
      december: "12",
    };
    const month = months[dmy[2]!.toLowerCase()];
    if (!month) return null;
    return `${dmy[3]}-${month}-${dmy[1]!.padStart(2, "0")}`;
  }
  const fy = label.match(/\bFY\s*(20\d{2}|19\d{2})\b/i);
  if (fy) return `${fy[1]}-12-31`;
  return null;
}

function inferPeriodStart(label: string, periodEnd: string): string | null {
  if (!/year ended|FY\s*\d{4}/i.test(label)) return null;
  const end = new Date(`${periodEnd}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return null;
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  start.setUTCDate(start.getUTCDate() + 1);
  return start.toISOString().slice(0, 10);
}

export function detectEntityName(text: string): {
  entityName: string | null;
  confidence: ScaleConfidenceId;
  warning?: string;
} {
  const limited = [
    ...text.matchAll(
      /\b([A-Z][A-Za-z0-9 &.'-]{2,80}?\s+(?:Ltd|Limited|PLC|Plc|Inc|Incorporated|Corp|Corporation|LLC))\b/g,
    ),
  ].map((m) => m[1]!.trim());
  const unique = [...new Set(limited)];
  if (unique.length === 0) return { entityName: null, confidence: "UNKNOWN" };
  if (unique.length > 1) {
    return {
      entityName: null,
      confidence: "AMBIGUOUS",
      warning: `Multiple entity names detected (${unique.slice(0, 3).join(" | ")}); left unset`,
    };
  }
  return { entityName: unique[0]!, confidence: "MEDIUM" };
}

export function detectConsolidationScope(text: string): {
  consolidationScope: "CONSOLIDATED" | "ENTITY" | "UNKNOWN";
  confidence: ScaleConfidenceId;
  warning?: string;
} {
  const consolidated = /\bconsolidated\b/i.test(text);
  const standalone =
    /\b(standalone|separate\s+financial\s+statements|company\s+only|entity[- ]only)\b/i.test(text);
  if (consolidated && standalone) {
    return {
      consolidationScope: "UNKNOWN",
      confidence: "AMBIGUOUS",
      warning: "Both consolidated and standalone signals present; scope left UNKNOWN",
    };
  }
  if (consolidated) return { consolidationScope: "CONSOLIDATED", confidence: "MEDIUM" };
  if (standalone) return { consolidationScope: "ENTITY", confidence: "MEDIUM" };
  return { consolidationScope: "UNKNOWN", confidence: "UNKNOWN" };
}

export type DuplicateKind =
  | "CORROBORATING"
  | "DIFFERENT_PERIOD"
  | "DIFFERENT_SCOPE"
  | "CONFLICTING"
  | "EXPLANATORY_REPEAT";

export type DuplicateFinding = {
  kind: DuplicateKind;
  concept: string;
  values: string[];
  count: number;
  message: string;
};

export function analyzeDuplicateMappedFigures(
  lines: Array<{
    concept: string;
    normalizedValue: string | null;
    periodLabel?: string | null;
    consolidationScope?: string | null;
    labelRaw?: string;
  }>,
): { warnings: string[]; findings: DuplicateFinding[] } {
  const warnings: string[] = [];
  const findings: DuplicateFinding[] = [];
  const groups = new Map<string, typeof lines>();

  for (const line of lines) {
    if (!line.normalizedValue || line.concept === "UNMAPPED") continue;
    const list = groups.get(line.concept) ?? [];
    list.push(line);
    groups.set(line.concept, list);
  }

  for (const [concept, group] of groups) {
    if (group.length < 2) continue;
    const values = [...new Set(group.map((g) => g.normalizedValue!).filter(Boolean))];
    const periods = new Set(group.map((g) => g.periodLabel ?? "").filter(Boolean));
    const scopes = new Set(group.map((g) => g.consolidationScope ?? "").filter(Boolean));
    const explanatory = group.every((g) =>
      /\b(note|refer|see also|as above|per note)\b/i.test(g.labelRaw ?? ""),
    );

    let kind: DuplicateKind = "CORROBORATING";
    if (explanatory) kind = "EXPLANATORY_REPEAT";
    else if (values.length > 1) kind = "CONFLICTING";
    else if (periods.size > 1) kind = "DIFFERENT_PERIOD";
    else if (scopes.size > 1) kind = "DIFFERENT_SCOPE";

    const message = `Duplicate mapped figure ${concept}:${values.join("|")} appeared ${group.length} times (${kind})`;
    findings.push({ kind, concept, values, count: group.length, message });
    warnings.push(message);
  }

  return { warnings, findings };
}

/** @deprecated Prefer analyzeDuplicateMappedFigures */
export function warnDuplicateNormalizedValues(
  lines: Array<{ concept: string; normalizedValue: string | null }>,
): string[] {
  return analyzeDuplicateMappedFigures(lines).warnings;
}
