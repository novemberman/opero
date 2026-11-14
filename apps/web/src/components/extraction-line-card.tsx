"use client";

import { FormEvent } from "react";
import { Alert, Badge, Button, Input, Select } from "./ui";
import { cn } from "../lib/cn";

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

export function ExtractionLineCard({
  line,
  canWrite,
  onReview,
}: {
  line: ExtractionLine;
  canWrite: boolean;
  onReview: (event: FormEvent<HTMLFormElement>, lineItemId: string) => void | Promise<void>;
}) {
  const isMonetary = !line.quantityClass || line.quantityClass === "MONETARY";
  const needsAttention =
    line.reviewStatus === "PENDING" ||
    Boolean(line.unitScaleRequiresReview) ||
    line.quality === "LOW" ||
    line.quality === "MANUAL" ||
    line.concept === "UNMAPPED";

  return (
    <li
      className={cn(
        "rounded-2xl border bg-surface p-4 shadow-sm sm:p-5",
        needsAttention ? "border-warning/40" : "border-border",
      )}
      data-testid="extraction-line-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-navy">{line.labelRaw}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={line.concept === "UNMAPPED" ? "warning" : "emerald"}>
              {line.concept}
            </Badge>
            {line.quantityClass ? <Badge tone="neutral">{line.quantityClass}</Badge> : null}
            <Badge tone={toneForReview(line.reviewStatus)}>{line.reviewStatus}</Badge>
            <Badge tone={line.quality === "HIGH" ? "success" : "warning"}>{line.quality}</Badge>
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
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Actual monetary amount
          </dt>
          <dd className="mt-1 font-data text-sm text-navy">
            {isMonetary
              ? `${line.currency ?? ""} ${line.actualMonetaryValue ?? "—"}`.trim()
              : "Not applicable — non-monetary"}
          </dd>
        </div>
      </dl>

      {!isMonetary ? (
        <div className="mt-3">
          <Alert tone="info" title="Non-monetary quantity">
            This line is classified as {line.quantityClass}. It is not treated as a validated NGN
            figure and is not scale-multiplied.
          </Alert>
        </div>
      ) : null}

      {line.unitScaleRequiresReview ? (
        <div className="mt-3">
          <Alert tone="warning" title="Scale needs confirmation">
            Confirm whether statement units require a thousands/millions multiplier before treating
            the actual amount as final.
          </Alert>
        </div>
      ) : null}

      {line.concept === "UNMAPPED" && isMonetary ? (
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
