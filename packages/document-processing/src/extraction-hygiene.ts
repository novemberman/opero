/**
 * Evidence-grounded PDF/text extraction hygiene (Stage B2.1).
 *
 * Rules are tied to verified Netshift FY2024 unmapped-monetary evidence rows.
 * They reclassify noise / note prose away from MONETARY and demote explanatory
 * mapped restatements — they never auto-confirm amounts or change formulas.
 */

import { canonicalizeLabel } from "./concepts.js";

/** Noise is never MONETARY — kept as contextual evidence only. */
export type ExtractionNoiseQuantityClass = "OTHER" | "NOTE_NUMBER";

export type ExtractionNoiseHit = {
  quantityClass: ExtractionNoiseQuantityClass;
  reason: string;
  /** Evidence row ids from B2-UNMAPPED-MONETARY-EVIDENCE.md when applicable */
  evidenceRows?: number[];
};

/**
 * Narrow noise patterns from B2 evidence (#4, #10, #19, #20, #24, #26)
 * plus connective note prose that is the same class of artifact (#11, #25).
 *
 * Does not suppress legitimate statement lines, comparatives, or bare concept labels.
 */
export function classifyExtractionNoise(input: {
  label: string;
  rawValue: string;
}): ExtractionNoiseHit | null {
  const label = input.label.replace(/\s+/g, " ").trim();
  const rawCompact = input.rawValue.replace(/[(),\s]/g, "");

  // #4, #19 — unit legend + page chrome ("NGN THOUSANDS Page" + page number)
  if (/^(NGN|USD|GBP|EUR|£|\$|₦)?\s*(THOUSANDS?|MILLIONS?)\s+Page$/i.test(label)) {
    return {
      quantityClass: "OTHER",
      reason: "Unit-scale legend / page chrome is not a monetary statement line",
      evidenceRows: [4, 19],
    };
  }

  // #20 — notes section heading with a note/page numeral
  if (/^Notes?\s+to\s+(the\s+)?/i.test(label) && /^\d{1,3}$/.test(rawCompact)) {
    return {
      quantityClass: "NOTE_NUMBER",
      reason: "Notes section heading / note reference is not a monetary statement line",
      evidenceRows: [20],
    };
  }

  // #10, #11, #24, #25, #26 — narrative connective prose fragments
  if (/^(equal|equals|plus|represents|comprising|including)\b/i.test(label)) {
    return {
      quantityClass: "OTHER",
      reason: "Narrative note prose fragment is not a monetary statement line",
      evidenceRows: [10, 11, 24, 25, 26],
    };
  }

  // #22 — truncated cash restatement ("Opening cash of" / "Closing cash of")
  // Distinct from full statement labels like "Closing cash and cash equivalents".
  if (/^(Opening|Closing)\s+cash\s+of$/i.test(label)) {
    return {
      quantityClass: "OTHER",
      reason: "Truncated cash narrative fragment is not a monetary statement line",
      evidenceRows: [22],
    };
  }

  return null;
}

/** True when a label looks like a trailing-"of" / connective restatement variant. */
export function isExplanatoryProseLabel(label: string): boolean {
  const trimmed = label.replace(/\s+/g, " ").trim();
  if (/^(equal|equals|plus|represents|comprising|including)\b/i.test(trimmed)) return true;
  if (/^(Opening|Closing)\s+cash\s+of$/i.test(trimmed)) return true;
  // "Revenue of", "Total assets of" — prose particle still present on the raw label.
  if (/\s+of$/i.test(trimmed)) return true;
  return false;
}

export type HygieneLine = {
  concept: string;
  normalizedValue: string | null;
  quantityClass: string;
  labelRaw: string;
};

/**
 * Demote explanatory mapped restatements when a cleaner same-concept + same-value
 * monetary line already exists in the same extraction pass.
 *
 * Dedupes only when:
 * - both are MONETARY
 * - both map to the same non-UNMAPPED concept
 * - normalized values match
 * - the demoted label is an explanatory prose variant (e.g. "Revenue of")
 *
 * Does not demote:
 * - identical clean labels (genuine repeated disclosure / corroboration)
 * - different concepts with the same amount
 * - different values
 * - unmapped lines
 */
export function demoteExplanatoryMappedDuplicates<T extends HygieneLine>(
  lines: T[],
): { lines: T[]; warnings: string[]; demotedIndexes: number[] } {
  const warnings: string[] = [];
  const demotedIndexes: number[] = [];
  const next = lines.map((line) => ({ ...line }));

  const groups = new Map<string, number[]>();
  for (let i = 0; i < next.length; i += 1) {
    const line = next[i]!;
    if (line.quantityClass !== "MONETARY") continue;
    if (!line.normalizedValue || line.concept === "UNMAPPED") continue;
    const key = `${line.concept}::${line.normalizedValue}`;
    const list = groups.get(key) ?? [];
    list.push(i);
    groups.set(key, list);
  }

  for (const [, indexes] of groups) {
    if (indexes.length < 2) continue;

    // Prefer the earliest non-prose label as the primary disclosure.
    const primaryIdx =
      indexes.find((i) => !isExplanatoryProseLabel(next[i]!.labelRaw)) ?? indexes[0]!;

    for (const idx of indexes) {
      if (idx === primaryIdx) continue;
      const candidate = next[idx]!;
      if (!isExplanatoryProseLabel(candidate.labelRaw)) {
        // Genuine repeated disclosure with a clean label — retain; duplicate analyzer warns.
        continue;
      }

      next[idx] = {
        ...candidate,
        quantityClass: "OTHER",
        // Keep concept text for auditability but non-monetary class excludes diagnostics.
        concept: "UNMAPPED",
      };
      demotedIndexes.push(idx);
      warnings.push(
        `Explanatory restatement demoted from monetary diagnostics: "${candidate.labelRaw}" duplicates ${candidate.concept}:${candidate.normalizedValue}`,
      );
    }
  }

  return { lines: next, warnings, demotedIndexes };
}

/** Canonical form used when comparing whether two labels name the same line. */
export function hygieneCanonicalLabel(label: string): string {
  return canonicalizeLabel(label).toLowerCase();
}
