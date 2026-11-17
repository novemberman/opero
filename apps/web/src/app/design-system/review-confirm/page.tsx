"use client";

/**
 * Interactive specimen for M2 review-confirm + confirmed-figure visibility E2E.
 * Mirrors production Confirm figure → authenticated POST and inventory filters.
 */
import { useMemo, useState } from "react";
import { ExtractionReviewBoard } from "../../../components/extraction-review-board";
import type { ExtractionLine } from "../../../components/extraction-line-card";
import { Alert } from "../../../components/ui";
import type { ExtractionReviewFilterId } from "../../../lib/extraction-review-presentation";
import {
  submitExtractionReview,
  successMessageForReviewAction,
  type ExtractionReviewSubmitInput,
} from "../../../lib/extraction-review-submit";

const ORG = "6693e901-9051-49bc-82a6-20094835432c";
const DOC = "cc04b221-06c6-41da-b016-213753ca2a08";
const REVENUE = "f6da2815-5e54-461c-ae35-0fed50d020d1";
const COGS = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const initialLines: ExtractionLine[] = [
  {
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
  },
  {
    id: COGS,
    concept: "COST_OF_GOODS_SOLD",
    labelRaw: "Cost of goods sold",
    rawValue: "750,000",
    normalizedValue: "750000",
    actualMonetaryValue: "750000",
    currency: "NGN",
    quantityClass: "MONETARY",
    unitScale: "ACTUAL",
    scaleConfidence: "HIGH",
    unitScaleRequiresReview: false,
    quality: "HIGH",
    reviewStatus: "PENDING",
    evidence: {
      evidenceKey: "evidence-cogs-fixture",
      rowIndex: 4,
      snippet: "Cost of goods sold,750,000",
    },
  },
];

export default function ReviewConfirmSpecimenPage() {
  const [lines, setLines] = useState(initialLines);
  const [submittingLineId, setSubmittingLineId] = useState<string | null>(null);
  const [preferredFilter, setPreferredFilter] = useState<ExtractionReviewFilterId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const totals = useMemo(() => {
    const confirmed = lines.filter((l) => l.reviewStatus === "CONFIRMED").length;
    const pending = lines.filter((l) => l.reviewStatus === "PENDING").length;
    return { total: lines.length, confirmed, pending };
  }, [lines]);

  async function onSubmitReview(input: ExtractionReviewSubmitInput) {
    if (submittingLineId) return;
    setSubmittingLineId(input.lineItemId);
    setError(null);
    setMessage(null);
    const result = await submitExtractionReview({ orgId: ORG, documentId: DOC }, input);
    if (!result.ok) {
      setError(result.message);
      setSubmittingLineId(null);
      return;
    }
    setLines((prev) =>
      prev.map((row) =>
        row.id === result.lineItemId
          ? {
              ...row,
              reviewStatus: result.reviewStatus,
              unitScaleRequiresReview: Boolean(result.unitScaleRequiresReview),
              scaleConfidence:
                result.reviewStatus === "CONFIRMED" ? "HIGH" : row.scaleConfidence,
            }
          : row,
      ),
    );
    setMessage(successMessageForReviewAction(input.action));
    setPreferredFilter("all");
    setSubmittingLineId(null);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6" data-testid="review-confirm-specimen">
      <header className="space-y-2">
        <p className="brand-kicker">Design system</p>
        <h1 className="text-3xl text-navy">Review confirm specimen</h1>
        <p className="text-sm text-text-secondary">
          Confirm figure must issue POST /review and keep the figure visible under All figures /
          Confirmed. Sibling fixtures stay PENDING unless explicitly submitted.
        </p>
        <p className="text-xs text-text-secondary" data-testid="specimen-inventory-counts">
          {totals.total} extracted · {totals.confirmed} confirmed · {totals.pending} pending
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
      {submittingLineId ? (
        <Alert tone="info" title="Saving">
          Persisting review to the server…
        </Alert>
      ) : null}

      <ExtractionReviewBoard
        lines={lines}
        canWrite
        submittingLineId={submittingLineId}
        preferredFilter={preferredFilter}
        onSubmitReview={onSubmitReview}
      />
    </main>
  );
}
