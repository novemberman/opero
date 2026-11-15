"use client";

import type { DocumentProcessingProgress } from "@opero/shared";
import { resolveProgressDisplay } from "../lib/processing-progress-display";
import { cn } from "../lib/cn";
import { Alert, Badge, ProgressBar } from "./ui";

function stageTone(status: string): "success" | "warning" | "error" | "neutral" | "info" {
  if (status === "COMPLETED") return "success";
  if (status === "FAILED") return "error";
  if (status === "RUNNING") return "info";
  if (status === "SKIPPED") return "neutral";
  return "neutral";
}

export function ProcessingTimeline({
  progress,
  elapsedLabel,
}: {
  progress: DocumentProcessingProgress;
  elapsedLabel?: string | null;
}) {
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const display = resolveProgressDisplay(progress);
  const currentLabel =
    progress.stages.find((s) => s.id === progress.currentStage)?.label ?? progress.currentStage;

  return (
    <section
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"
      aria-live="polite"
      aria-busy={progress.stageStatus === "RUNNING"}
      data-testid="processing-timeline"
      data-progress-mode={display.mode}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald">Processing</p>
          <h2 className="mt-1 text-xl text-navy">{currentLabel}</h2>
          {progress.nextRecommendedAction ? (
            <p className="mt-1 text-sm text-text-secondary">{progress.nextRecommendedAction}</p>
          ) : null}
        </div>
        <div className="text-right">
          {elapsedLabel ? <p className="text-sm text-text-secondary">{elapsedLabel}</p> : null}
          <Badge tone={stageTone(progress.stageStatus)} className="mt-1">
            {progress.stageStatus}
          </Badge>
        </div>
      </div>

      <div className="mt-4">
        {display.mode === "stage" ? (
          <ProgressBar indeterminate label={display.label} />
        ) : (
          <ProgressBar value={display.percent ?? 0} label={display.label} />
        )}
        <p className="mt-2 text-xs text-text-secondary">
          {display.mode === "percent"
            ? "Numeric progress comes from the backend processing contract."
            : "No reliable backend percentage — showing stage-based progress only."}
        </p>
      </div>

      {progress.humanActionRequired ? (
        <div className="mt-4">
          <Alert tone="warning" title="Action required">
            Review extracted figures before diagnostics can proceed.
          </Alert>
        </div>
      ) : null}
      {progress.errorCategory ? (
        <div className="mt-4">
          <Alert tone="error" title="Processing issue">
            {progress.errorCategory}
            {progress.retryAvailable ? " — retry may be available." : ""}
          </Alert>
        </div>
      ) : null}

      <ol className="mt-5 space-y-2">
        {progress.stages.map((stage) => {
          const current = stage.id === progress.currentStage;
          return (
            <li
              key={stage.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm",
                current
                  ? "border-emerald/30 bg-emerald/5 text-navy"
                  : "border-transparent text-text-secondary",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold",
                  stage.status === "COMPLETED" && "bg-emerald text-text-inverse",
                  stage.status === "FAILED" && "bg-error text-text-inverse",
                  stage.status === "RUNNING" && "border border-emerald text-emerald",
                  stage.status === "PENDING" && "border border-border text-text-secondary",
                  stage.status === "SKIPPED" && "border border-border text-text-disabled",
                  current && stage.status === "RUNNING" && !reducedMotion && "animate-pulse",
                )}
                aria-hidden
              >
                {stage.status === "COMPLETED"
                  ? "✓"
                  : stage.status === "FAILED"
                    ? "!"
                    : stage.status === "SKIPPED"
                      ? "–"
                      : "•"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{stage.label}</span>
                <span className="sr-only"> — {stage.status}</span>
                <span className="mt-0.5 block text-xs capitalize text-text-secondary">
                  {stage.status.toLowerCase()}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
