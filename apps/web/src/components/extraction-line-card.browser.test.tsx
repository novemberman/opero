/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtractionLineCard, type ExtractionLine } from "./extraction-line-card";

const REVENUE = "f6da2815-5e54-461c-ae35-0fed50d020d1";

const pendingRevenue: ExtractionLine = {
  id: REVENUE,
  concept: "REVENUE",
  labelRaw: "Revenue",
  rawValue: "1,250,000",
  normalizedValue: "1250000",
  currency: "NGN",
  quantityClass: "MONETARY",
  unitScale: "ACTUAL",
  scaleConfidence: "UNKNOWN",
  unitScaleRequiresReview: true,
  quality: "HIGH",
  reviewStatus: "PENDING",
  evidence: { evidenceKey: "ev-revenue", rowIndex: 3 },
};

describe("ExtractionLineCard Confirm figure (browser DOM)", () => {
  afterEach(() => {
    cleanup();
  });

  it("one click on Confirm figure invokes CONFIRM for that line only", async () => {
    const onSubmitReview = vi.fn().mockResolvedValue(undefined);
    render(
      <ExtractionLineCard line={pendingRevenue} canWrite onSubmitReview={onSubmitReview} />,
    );

    fireEvent.click(screen.getByTestId("confirm-figure"));
    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledTimes(1));
    expect(onSubmitReview).toHaveBeenCalledWith({
      lineItemId: REVENUE,
      action: "CONFIRM",
    });
  });

  it("disables Confirm figure while submitting (duplicate-click safety)", () => {
    const onSubmitReview = vi.fn();
    render(
      <ExtractionLineCard
        line={pendingRevenue}
        canWrite
        submitting
        onSubmitReview={onSubmitReview}
      />,
    );
    const button = screen.getByTestId("confirm-figure") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSubmitReview).not.toHaveBeenCalled();
  });

  it("does not show Confirm figure when reviewStatus is already CONFIRMED", () => {
    render(
      <ExtractionLineCard
        line={{ ...pendingRevenue, reviewStatus: "CONFIRMED", unitScaleRequiresReview: false }}
        canWrite
        onSubmitReview={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("confirm-figure")).toBeNull();
  });
});
