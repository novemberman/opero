"use client";

import type { DocumentProcessingProgress } from "@opero/shared";

function stageIcon(status: string, reducedMotion: boolean): string {
  if (status === "COMPLETED") return "✓";
  if (status === "FAILED") return "!";
  if (status === "RUNNING") return reducedMotion ? "•" : "◌";
  if (status === "SKIPPED") return "–";
  return "○";
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

  const percent = progress.progressPercent;
  const indeterminate = percent == null;

  return (
    <section
      className="rounded-2xl border border-line bg-white/70 p-5"
      aria-live="polite"
      aria-busy={progress.stageStatus === "RUNNING"}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.14em] text-pine">Processing</p>
          <h2 className="mt-1 text-xl text-ink">
            {progress.stages.find((s) => s.id === progress.currentStage)?.label ??
              progress.currentStage}
          </h2>
          {progress.nextRecommendedAction ? (
            <p className="mt-1 text-sm text-muted">{progress.nextRecommendedAction}</p>
          ) : null}
        </div>
        {elapsedLabel ? <p className="text-sm text-muted">{elapsedLabel}</p> : null}
      </div>

      <div
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : percent}
        aria-valuetext={
          indeterminate ? "Progress indeterminate" : `${percent} percent complete`
        }
      >
        {indeterminate ? (
          <div
            className={`h-full w-1/3 rounded-full bg-pine ${reducedMotion ? "" : "animate-pulse"}`}
          />
        ) : (
          <div
            className="h-full rounded-full bg-pine transition-[width] duration-500"
            style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
          />
        )}
      </div>

      {progress.humanActionRequired ? (
        <p className="mt-3 text-sm text-copper" role="status">
          Action required: review extracted figures before diagnostics.
        </p>
      ) : null}
      {progress.errorCategory ? (
        <p className="mt-3 text-sm text-copper" role="alert">
          {progress.errorCategory}
          {progress.retryAvailable ? " — retry available" : ""}
        </p>
      ) : null}

      <ol className="mt-5 space-y-2">
        {progress.stages.map((stage) => {
          const current = stage.id === progress.currentStage;
          return (
            <li
              key={stage.id}
              className={`flex items-start gap-3 text-sm ${
                current ? "text-ink" : "text-muted"
              }`}
            >
              <span
                className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-line text-xs ${
                  stage.status === "COMPLETED"
                    ? "bg-pine text-paper"
                    : stage.status === "FAILED"
                      ? "bg-copper text-paper"
                      : current && !reducedMotion
                        ? "animate-pulse"
                        : ""
                }`}
                aria-hidden
              >
                {stageIcon(stage.status, Boolean(reducedMotion))}
              </span>
              <span>
                <span className="font-medium">{stage.label}</span>
                <span className="sr-only"> — {stage.status}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
