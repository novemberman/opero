import type { DocumentProcessingProgress } from "@opero/shared";

export type ProgressDisplay = {
  /** Show a numeric percent only when the backend supplied one. */
  mode: "percent" | "stage";
  percent: number | null;
  label: string;
};

/**
 * Derive progress-bar presentation from backend `DocumentProcessingProgress`.
 * Never invents a percentage when `progressPercent` is null.
 */
export function resolveProgressDisplay(
  progress: Pick<DocumentProcessingProgress, "progressPercent" | "currentStage" | "stages">,
): ProgressDisplay {
  const percent = progress.progressPercent;
  if (percent != null && Number.isFinite(percent)) {
    const clamped = Math.min(100, Math.max(0, Math.round(percent)));
    return {
      mode: "percent",
      percent: clamped,
      label: `${clamped}% complete`,
    };
  }

  const current =
    progress.stages.find((s) => s.id === progress.currentStage)?.label ?? progress.currentStage;
  return {
    mode: "stage",
    percent: null,
    label: `Stage progress — ${current}`,
  };
}
