import { apiErrorMessage, apiFetch } from "./api";

export type ExtractionReviewAction = "CONFIRM" | "CORRECT" | "REJECT";

export type ExtractionReviewSubmitInput = {
  lineItemId: string;
  action: ExtractionReviewAction;
  newValue?: string;
  reason?: string;
};

export type ExtractionReviewSubmitContext = {
  orgId: string;
  documentId: string;
};

export type ExtractionReviewSubmitResult =
  | {
      ok: true;
      lineItemId: string;
      reviewStatus: string;
      unitScaleRequiresReview?: boolean;
    }
  | {
      ok: false;
      status: number;
      code: "VALIDATION" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "INCOMPLETE" | "SERVER" | "NETWORK";
      message: string;
    };

/** Client-side validation before any network call. */
export function validateExtractionReviewInput(
  input: ExtractionReviewSubmitInput,
): string | null {
  const newValue = input.newValue?.trim() ?? "";
  if (input.action === "CONFIRM" && newValue) {
    return "A corrected value is entered. Choose “Correct & confirm” to submit the new amount, or clear the field to Confirm the existing value.";
  }
  if (input.action === "CORRECT" && !newValue) {
    return "Correct & confirm requires a corrected statement-units value.";
  }
  return null;
}

/** Builds the authenticated review POST path and JSON body (no side effects). */
export function buildExtractionReviewRequest(
  ctx: ExtractionReviewSubmitContext,
  input: ExtractionReviewSubmitInput,
): { path: string; method: "POST"; json: Record<string, unknown> } {
  const newValue = input.newValue?.trim() ?? "";
  const reason = input.reason?.trim() ?? "";
  return {
    path: `/organizations/${ctx.orgId}/documents/${ctx.documentId}/review`,
    method: "POST",
    json: {
      lineItemId: input.lineItemId,
      action: input.action,
      newValue: input.action === "CORRECT" ? newValue : undefined,
      reason: reason || undefined,
    },
  };
}

const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please sign in again. Your confirmation was not saved.";

export function classifyReviewHttpFailure(
  status: number,
  body: unknown,
): Extract<ExtractionReviewSubmitResult, { ok: false }> {
  // Prefer curated operator copy for auth/tenancy failures — raw API bodies like
  // "Unauthorized" must not replace the session-expiry guidance.
  if (status === 401) {
    return { ok: false, status, code: "UNAUTHORIZED", message: SESSION_EXPIRED_MESSAGE };
  }
  const fallback =
    status === 403
      ? "You do not have permission to confirm figures for this organization."
      : status === 404
        ? "Figure or document was not found for this organization."
        : "Review failed";
  const message = apiErrorMessage(body, fallback);
  const code =
    status === 403
      ? "FORBIDDEN"
      : status === 404
        ? "NOT_FOUND"
        : status >= 500
          ? "SERVER"
          : "VALIDATION";
  return { ok: false, status, code, message };
}

/**
 * Performs the authenticated review mutation with CSRF via apiFetch.
 * Never reports success without a persisted lineItem id from the server.
 */
export async function submitExtractionReview(
  ctx: ExtractionReviewSubmitContext,
  input: ExtractionReviewSubmitInput,
): Promise<ExtractionReviewSubmitResult> {
  const validationError = validateExtractionReviewInput(input);
  if (validationError) {
    return { ok: false, status: 0, code: "VALIDATION", message: validationError };
  }

  const request = buildExtractionReviewRequest(ctx, input);
  try {
    const { status, body } = await apiFetch<{
      message?: string;
      lineItem?: { id?: string; reviewStatus?: string; unitScaleRequiresReview?: boolean };
    }>(request.path, { method: request.method, json: request.json });

    if (status >= 400) {
      return classifyReviewHttpFailure(status, body);
    }

    const lineItemId = body.lineItem?.id;
    const reviewStatus = body.lineItem?.reviewStatus;
    if (!lineItemId || !reviewStatus) {
      return {
        ok: false,
        status,
        code: "INCOMPLETE",
        message: "Review response was incomplete; refresh and verify before continuing.",
      };
    }

    return {
      ok: true,
      lineItemId,
      reviewStatus,
      unitScaleRequiresReview: body.lineItem?.unitScaleRequiresReview,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      code: "NETWORK",
      message: err instanceof Error ? err.message : "Review request failed",
    };
  }
}

export function successMessageForReviewAction(action: ExtractionReviewAction): string {
  if (action === "CONFIRM") return "Figure confirmed — original raw evidence preserved";
  if (action === "CORRECT") return "Correction confirmed — original raw evidence preserved";
  return "Figure rejected — original raw evidence preserved";
}
