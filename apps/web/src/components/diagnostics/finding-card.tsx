"use client";

import Link from "next/link";
import { Badge } from "../ui";

export type FindingInput = {
  id: string;
  ruleId: string;
  category: string;
  severity: string;
  title: string;
  explanation: string;
  implication: string;
  suggestedAction: string;
  confidence?: string;
  supportingMetrics?: string[];
  evidence: Array<{
    snapshotKey: string;
    documentId: string | null;
    lineItemId?: string | null;
    evidenceReferenceId?: string | null;
    label: string | null;
  }>;
};

function severityTone(severity: string): "neutral" | "success" | "warning" | "error" | "info" {
  if (severity === "HIGH") return "error";
  if (severity === "MEDIUM") return "warning";
  if (severity === "LOW") return "info";
  return "neutral";
}

export function FindingCard({
  finding,
  orgId,
}: {
  finding: FindingInput;
  orgId: string;
}) {
  return (
    <li
      className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"
      data-testid="finding-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{finding.category}</Badge>
        <Badge tone={severityTone(finding.severity)}>{finding.severity}</Badge>
        <span className="font-data text-xs text-text-secondary">{finding.ruleId}</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-navy">{finding.title}</h3>
      <p className="mt-2 text-sm text-text-secondary">{finding.explanation}</p>
      <p className="mt-2 text-sm text-navy">{finding.implication}</p>
      <p className="mt-2 text-sm font-medium text-navy">{finding.suggestedAction}</p>

      <details className="mt-4 text-sm" data-testid="finding-evidence">
        <summary className="cursor-pointer font-semibold text-navy">
          Source evidence ({finding.evidence.length})
        </summary>
        {finding.evidence.length === 0 ? (
          <p className="mt-2 text-text-secondary">No evidence links were returned for this finding.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {finding.evidence.map((item) => (
              <li
                key={`${item.snapshotKey}-${item.documentId ?? "x"}`}
                className="rounded-xl border border-border bg-workspace px-3 py-2"
              >
                {item.documentId ? (
                  <Link
                    href={`/organizations/${orgId}/documents/${item.documentId}`}
                    className="font-medium text-emerald no-underline hover:underline"
                  >
                    {item.label ?? "Open source document"}
                  </Link>
                ) : (
                  <span className="font-medium text-navy">{item.label ?? "Evidence"}</span>
                )}
                <p className="mt-1 font-data text-xs text-text-secondary">
                  Snapshot {item.snapshotKey}
                  {item.lineItemId ? ` · line ${item.lineItemId.slice(0, 8)}…` : ""}
                  {item.evidenceReferenceId
                    ? ` · ref ${item.evidenceReferenceId.slice(0, 8)}…`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        {finding.supportingMetrics?.length ? (
          <p className="mt-2 text-xs text-text-secondary">
            Supporting metrics: {finding.supportingMetrics.join(", ")}
          </p>
        ) : null}
        {finding.confidence ? (
          <p className="mt-1 text-xs text-text-secondary">Confidence: {finding.confidence}</p>
        ) : null}
      </details>
    </li>
  );
}
