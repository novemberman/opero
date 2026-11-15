"use client";

import { FormEvent } from "react";
import { formatFinancialConceptLabel } from "../lib/extraction-review-presentation";
import { resolveMonetaryPresentation } from "../lib/monetary-presentation";
import { cn } from "../lib/cn";
import { Alert, Badge, Button, Input, Select } from "./ui";

export type ExtractionLine = {
  id: string;
  concept: string;
  labelRaw: string;
  rawValue: string;
  normalizedValue: string | null;
  actualMonetaryValue?: string | null;
  currency?: string | null;
  quantityClass?: string;
  unitScale?: string;
  scaleConfidence?: string;
  unitScaleRequiresReview?: boolean;
  quality: string;
  reviewStatus: string;
  evidence: {
    evidenceKey: string;
    pageNumber?: number | null;
    sheetName?: string | null;
    cellRef?: string | null;
    rowIndex?: number | null;
    columnIndex?: number | null;
    snippet?: string | null;
  } | null;
};

function toneForReview(status: string): "warning" | "success" | "error" | "neutral" {
  if (status === "PENDING") return "warning";
  if (status === "CONFIRMED" || status === "CORRECTED") return "success";
  if (status === "REJECTED") return "error";
  return "neutral";
}

function amountTone(
  kind: ReturnType<typeof resolveMonetaryPresentation>["kind"],
): "success" | "warning" | "neutral" | "info" {
  if (kind === "confirmed") return "success";
  if (kind === "provisional") return "warning";
  if (kind === "non_monetary") return "info";
  return "neutral";
}

export function ExtractionLineCard({
  line,
  canWrite,
  onReview,
}: {
  line: ExtractionLine;
  canWrite: boolean;
  onReview: (event: FormEvent<HTMLFormElement>, lineItemId: string) => void | Promise<void>;
}) {
  const presentation = resolveMonetaryPresentation(line);
  const needsAttention =
    line.reviewStatus === "PENDING" ||
    Boolean(line.unitScaleRequiresReview) ||
    line.quality === "LOW" ||
    line.quality === "MANUAL" ||
    line.concept === "UNMAPPED" ||
    presentation.kind === "provisional" ||
    presentation.kind === "undetermined";

  return (
    <li
      className={cn(
        "rounded-2xl border bg-surface p-4 shadow-sm sm:p-5",
        needsAttention ? "border-warning/40" : "border-border",
      )}
      data-testid="extraction-line-card"
      data-amount-kind={presentation.kind}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-navy">{line.labelRaw}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge
              tone={line.concept === "UNMAPPED" ? "warning" : "emerald"}
              title={line.concept}
              data-concept={line.concept}
            >
              {formatFinancialConceptLabel(line.concept)}
            </Badge>
            {line.quantityClass ? <Badge tone="neutral">{line.quantityClass}</Badge> : null}
            <Badge tone={toneForReview(line.reviewStatus)}>{line.reviewStatus}</Badge>
            <Badge tone={line.quality === "HIGH" ? "success" : "warning"}>{line.quality}</Badge>
            <Badge tone={amountTone(presentation.kind)}>
              {presentation.kind === "confirmed"
                ? "Confirmed amount"
                : presentation.kind === "provisional"
                  ? "Provisional amount"
                  : presentation.kind === "undetermined"
                    ? "Undetermined amount"
                    : "Non-monetary"}
            </Badge>
          </div>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Raw value
          </dt>
          <dd className="mt-1 font-data text-sm text-navy">{line.rawValue}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Statement units
          </dt>
          <dd className="mt-1 font-data text-sm text-navy">{line.normalizedValue ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Scale
          </dt>
          <dd className="mt-1 font-data text-sm text-navy">
            {line.unitScale ?? "—"}
            {line.scaleConfidence ? ` · ${line.scaleConfidence}` : ""}
          </dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
            {presentation.fieldLabel}
          </dt>
          <dd
            className={cn(
              "mt-1 font-data text-sm",
              presentation.isEstablished ? "text-navy" : "text-text-secondary",
            )}
            data-testid="monetary-amount-display"
            data-established={presentation.isEstablished ? "true" : "false"}
          >
            {presentation.amountText}
          </dd>
        </div>
      </dl>

      {presentation.cautionTitle && presentation.cautionBody ? (
        <div className="mt-3">
          <Alert
            tone={presentation.kind === "non_monetary" ? "info" : "warning"}
            title={presentation.cautionTitle}
          >
            {presentation.cautionBody}
          </Alert>
        </div>
      ) : null}

      {line.unitScaleRequiresReview && presentation.kind !== "confirmed" ? (
        <div className="mt-3">
          <Alert tone="warning" title="Scale needs confirmation">
            Confirm whether statement units require a thousands/millions multiplier before treating
            any calculated amount as final. An ambiguous scale must not be shown as an established
            NGN figure.
          </Alert>
        </div>
      ) : null}

      {!line.unitScaleRequiresReview &&
      presentation.kind !== "non_monetary" &&
      line.scaleConfidence &&
      ["MEDIUM", "LOW", "UNKNOWN", "AMBIGUOUS"].includes(line.scaleConfidence.toUpperCase()) ? (
        <div className="mt-3" data-testid="scale-confidence-info">
          <Alert tone="info" title={`Scale confidence: ${line.scaleConfidence}`}>
            This confidence level is informational only. It does not require scale confirmation
            unless the scale-review flag is set. Existing unit-scale review semantics are unchanged.
          </Alert>
        </div>
      ) : null}

      {line.concept === "UNMAPPED" && presentation.kind !== "non_monetary" ? (
        <div className="mt-3">
          <Alert tone="warning" title="Unmapped concept">
            Mapping is not confirmed. Do not treat this as a validated diagnostic input until
            reviewed.
          </Alert>
        </div>
      ) : null}

      {line.evidence ? (
        <p className="mt-3 text-xs text-text-secondary">
          Evidence {line.evidence.evidenceKey.slice(0, 8)}…
          {line.evidence.pageNumber != null ? ` · page ${line.evidence.pageNumber}` : ""}
          {line.evidence.sheetName ? ` · sheet ${line.evidence.sheetName}` : ""}
          {line.evidence.cellRef ? ` · cell ${line.evidence.cellRef}` : ""}
          {line.evidence.rowIndex != null ? ` · row ${line.evidence.rowIndex}` : ""}
          {line.evidence.snippet ? ` · ${line.evidence.snippet}` : ""}
        </p>
      ) : null}

      {canWrite ? (
        <form
          className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[10rem_1fr_1fr_auto]"
          onSubmit={(event) => void onReview(event, line.id)}
        >
          <Select name="action" label="Action" defaultValue="CONFIRM">
            <option value="CONFIRM">Confirm</option>
            <option value="CORRECT">Correct value</option>
            <option value="REJECT">Reject</option>
          </Select>
          <Input
            name="newValue"
            label="Corrected statement units"
            placeholder="Only for Correct"
          />
          <Input name="reason" label="Reason" placeholder="Optional note" />
          <div className="flex items-end">
            <Button type="submit" size="sm">
              Save review
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
