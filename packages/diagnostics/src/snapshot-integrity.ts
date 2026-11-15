/**
 * Read-time integrity assessment for frozen diagnostic snapshots.
 *
 * Pre-P0-A runs may have stored scaled actualValue for PENDING/CORRECTED lines.
 * We never rewrite those rows; callers use this to withhold "authoritative"
 * presentation (verified publication chrome, etc.).
 */

export type SnapshotIntegrityAssessment = {
  authoritative: boolean;
  code: "OK" | "UNCONFIRMED_AMOUNTS_IN_SNAPSHOT";
  contaminatedLineCount: number;
  detail: string | null;
};

const UNCONFIRMED = new Set(["PENDING", "CORRECTED"]);

function lineHasAmount(line: Record<string, unknown>): boolean {
  const actual = line.actualValue;
  return actual != null && actual !== "null" && String(actual).trim() !== "";
}

/**
 * Inspect a stored diagnostic_input_snapshots.payload (or equivalent).
 * Safe on missing/malformed payloads — treats as OK with zero contamination.
 */
export function assessSnapshotPayloadIntegrity(payload: unknown): SnapshotIntegrityAssessment {
  if (!payload || typeof payload !== "object") {
    return { authoritative: true, code: "OK", contaminatedLineCount: 0, detail: null };
  }
  const lines = (payload as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) {
    return { authoritative: true, code: "OK", contaminatedLineCount: 0, detail: null };
  }

  let contaminatedLineCount = 0;
  for (const raw of lines) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as Record<string, unknown>;
    const status = String(line.reviewStatus ?? "");
    if (lineHasAmount(line) && UNCONFIRMED.has(status)) {
      contaminatedLineCount += 1;
    }
  }

  if (contaminatedLineCount === 0) {
    return { authoritative: true, code: "OK", contaminatedLineCount: 0, detail: null };
  }

  return {
    authoritative: false,
    code: "UNCONFIRMED_AMOUNTS_IN_SNAPSHOT",
    contaminatedLineCount,
    detail: `${contaminatedLineCount} snapshot line(s) carry amounts that were not human-CONFIRMED; treat outputs as provisional and recompute after confirmation`,
  };
}

export const UNCONFIRMED_SNAPSHOT_DISCLOSURE =
  "This analysis may include financial amounts that were not human-confirmed at the time it was produced. Do not treat it as authoritative; confirm material figures and run a new diagnostic.";
