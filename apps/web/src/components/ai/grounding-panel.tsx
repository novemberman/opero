"use client";

import { formatGroundingReasons } from "../../lib/ai-interpretation-presentation";
import { Alert, Badge, Card, CardHeader } from "../ui";

export type Claim = {
  text: string;
  groundedMetricCodes?: string[];
  groundedFindingIds?: string[];
  reasons?: string[];
  unknownMetricCodes?: string[];
  unknownFindingIds?: string[];
  unsupportedNumbers?: string[];
  restrictedTerms?: string[];
};

function flaggedDetails(claim: Claim): string[] {
  return [
    ...(claim.unknownMetricCodes ?? []),
    ...(claim.unknownFindingIds ?? []),
    ...(claim.unsupportedNumbers ?? []),
    ...(claim.restrictedTerms ?? []),
  ];
}

export function GroundingPanel({
  groundedClaims,
  unsupportedClaims,
  coversEditedNarrative,
}: {
  groundedClaims: Claim[];
  unsupportedClaims: Claim[];
  coversEditedNarrative: boolean;
}) {
  return (
    <Card data-testid="grounding-panel">
      <CardHeader
        title="Evidence grounding"
        description={
          coversEditedNarrative
            ? "The check covers this version’s narrative, including reviewer edits."
            : "Claims are checked against metrics and findings in the linked diagnostic."
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">{groundedClaims.length} grounded</Badge>
            <Badge tone={unsupportedClaims.length ? "warning" : "neutral"}>
              {unsupportedClaims.length} flagged
            </Badge>
          </div>
        }
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="text-sm font-semibold text-navy">Deterministic anchors</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Statements that cite metrics or findings present in this diagnostic.
          </p>
          {groundedClaims.length === 0 ? (
            <p className="mt-3 text-sm text-text-secondary">No grounded claims recorded.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {groundedClaims.map((claim, index) => (
                <li
                  key={`g-${index}-${claim.text.slice(0, 24)}`}
                  className="rounded-xl border border-border bg-workspace px-3 py-2 text-sm"
                >
                  <p className="text-navy">{claim.text}</p>
                  <p className="mt-1 font-data text-xs text-text-secondary">
                    {[
                      ...(claim.groundedMetricCodes ?? []),
                      ...(claim.groundedFindingIds ?? []),
                    ].join(", ") || "Referenced diagnostic facts"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-navy">Uncertainty & limitations</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Flagged statements must not be treated as established financial conclusions.
          </p>
          {unsupportedClaims.length === 0 ? (
            <div className="mt-3">
              <Alert tone="success" title="No unsupported claims">
                Grounding found no flagged statements in the generated draft.
              </Alert>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {unsupportedClaims.map((claim, index) => (
                <li
                  key={`u-${index}-${claim.text.slice(0, 24)}`}
                  className="rounded-xl border border-warning/30 bg-warning-surface px-3 py-2 text-sm"
                >
                  <p className="text-navy">{claim.text}</p>
                  <p className="mt-1 text-warning">
                    {formatGroundingReasons(claim.reasons)}
                    {flaggedDetails(claim).length > 0
                      ? ` (${flaggedDetails(claim).join(", ")})`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Card>
  );
}
