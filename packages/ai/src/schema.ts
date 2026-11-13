import { z } from "zod";

/** Hard caps keep a misbehaving model from producing unbounded narrative. */
export const AI_OUTPUT_LIMITS = {
  summaryChars: 4_000,
  itemChars: 1_500,
  listItems: 25,
  claims: 60,
  referencesPerClaim: 40,
  referenceChars: 200,
} as const;

const narrativeText = z.string().trim().min(1).max(AI_OUTPUT_LIMITS.itemChars);

const narrativeList = z.array(narrativeText).max(AI_OUTPUT_LIMITS.listItems);

const referenceList = z
  .array(z.string().trim().min(1).max(AI_OUTPUT_LIMITS.referenceChars))
  .max(AI_OUTPUT_LIMITS.referencesPerClaim);

/**
 * A single factual statement plus the deterministic facts it rests on.
 * Missing reference arrays parse as empty, which grounding then rejects.
 */
export const aiClaimSchema = z.object({
  text: narrativeText,
  groundedMetricCodes: referenceList.default([]),
  groundedFindingIds: referenceList.default([]),
});

/** Structured narrative every provider must return. Unknown keys are dropped. */
export const aiNarrativeSchema = z.object({
  summary: z.string().trim().min(1).max(AI_OUTPUT_LIMITS.summaryChars),
  keyObservations: narrativeList,
  risks: narrativeList,
  limitations: narrativeList,
  claims: z.array(aiClaimSchema).max(AI_OUTPUT_LIMITS.claims),
});

export type AiClaim = z.infer<typeof aiClaimSchema>;
export type AiNarrative = z.infer<typeof aiNarrativeSchema>;

export class AiOutputValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`AI output failed schema validation: ${issues.join("; ")}`);
    this.name = "AiOutputValidationError";
    this.issues = issues;
  }
}

function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

/** Validates an already-parsed value. Throws `AiOutputValidationError` on mismatch. */
export function parseAiNarrative(value: unknown): AiNarrative {
  const parsed = aiNarrativeSchema.safeParse(value);
  if (!parsed.success) throw new AiOutputValidationError(describeIssues(parsed.error));
  return parsed.data;
}

/**
 * Parses model text into a validated narrative. Tolerates a single Markdown
 * code fence around the JSON, which some OpenAI-compatible servers emit even
 * in JSON mode. Anything else that is not a JSON object is rejected.
 */
export function parseAiNarrativeJson(text: string): AiNarrative {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/i.exec(trimmed);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  let value: unknown;
  try {
    value = JSON.parse(candidate);
  } catch {
    throw new AiOutputValidationError(["(root): response is not valid JSON"]);
  }
  return parseAiNarrative(value);
}
