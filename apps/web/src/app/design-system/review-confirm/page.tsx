"use client";

/**
 * Interactive specimen for M2 P0 review-confirm E2E.
 * Mirrors production Confirm figure → authenticated POST contract with mockable /api/v1.
 */
import { useMemo, useState } from "react";
import { ExtractionLineCard, type ExtractionLine } from "../../../components/extraction-line-card";
import { Alert } from "../../../components/ui";
import {
  submitExtractionReview,
  successMessageForReviewAction,
  type ExtractionReviewSubmitInput,
} from "../../../lib/extraction-review-submit";

const ORG = "6693e901-9051-49bc-82a6-20094835432c";
const DOC = "cc04b221-06c6-41da-b016-213753ca2a08";
const REVENUE = "f6da2815-5e54-461c-ae35-0fed50d020d1";

const initialLine: ExtractionLine = {
  id: REVENUE,
  concept: "REVENUE",
  labelRaw: "Revenue",
  rawValue: "1,250,000",
  normalizedValue: "1250000",
  actualMonetaryValue: "1250000",
  currency: "NGN",
  quantityClass: "MONETARY",
  unitScale: "ACTUAL",
  scaleConfidence: "UNKNOWN",
  unitScaleRequiresReview: true,
  quality: "HIGH",
  reviewStatus: "PENDING",
  evidence: {
    evidenceKey: "evidence-revenue-fixture",
    rowIndex: 3,
    snippet: "Revenue,1,250,000",
  },
};

export default function ReviewConfirmSpecimenPage() {
  const [line, setLine] = useState(initialLine);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const siblingStillPending = useMemo(
    () => ({
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      concept: "COST_OF_GOODS_SOLD",
      reviewStatus: "PENDING",
    }),
    [],
  );

  async function onSubmitReview(input: ExtractionReviewSubmitInput) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    const result = await submitExtractionReview({ orgId: ORG, documentId: DOC }, input);
    if (!result.ok) {
      setError(result.message);
      setSubmitting(false);
      return;
    }
    setLine((prev) => ({
      ...prev,
      reviewStatus: result.reviewStatus,
      unitScaleRequiresReview: Boolean(result.unitScaleRequiresReview),
      scaleConfidence: result.reviewStatus === "CONFIRMED" ? "HIGH" : prev.scaleConfidence,
    }));
    setMessage(successMessageForReviewAction(input.action));
    setSubmitting(false);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6" data-testid="review-confirm-specimen">
      <header className="space-y-2">
        <p className="brand-kicker">Design system</p>
        <h1 className="text-3xl text-navy">Review confirm specimen</h1>
        <p className="text-sm text-text-secondary">
          One-click Confirm figure must issue POST /review. Sibling fixture stays PENDING unless
          explicitly submitted.
        </p>
      </header>

      {error ? (
        <Alert tone="error" title="Something went wrong">
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert tone="success" title="Saved">
          {message}
        </Alert>
      ) : null}
      {submitting ? (
        <Alert tone="info" title="Saving">
          Persisting review to the server…
        </Alert>
      ) : null}

      <ExtractionLineCard
        line={line}
        canWrite
        submitting={submitting}
        onSubmitReview={onSubmitReview}
      />

      <p className="text-xs text-text-secondary" data-testid="sibling-pending-guard">
        Sibling {siblingStillPending.concept}: {siblingStillPending.reviewStatus}
      </p>
    </main>
  );
}
