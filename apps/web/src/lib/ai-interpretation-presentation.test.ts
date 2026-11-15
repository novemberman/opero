import { describe, expect, it } from "vitest";
import {
  aiAvailabilityPresentation,
  aiRunStatusPresentation,
  formatGroundingReasons,
} from "./ai-interpretation-presentation";

describe("ai-interpretation-presentation", () => {
  it("distinguishes unavailable, simulated and live provider states", () => {
    expect(
      aiAvailabilityPresentation({
        provider: "none",
        simulated: false,
        shareStructuredContext: false,
        available: false,
        reason: "Provider not configured",
      }).kind,
    ).toBe("unavailable");

    expect(
      aiAvailabilityPresentation({
        provider: "simulated",
        simulated: true,
        shareStructuredContext: true,
        available: true,
        reason: null,
      }).kind,
    ).toBe("simulated");

    expect(
      aiAvailabilityPresentation({
        provider: "openai",
        simulated: false,
        shareStructuredContext: true,
        available: true,
        reason: null,
      }).kind,
    ).toBe("live");
  });

  it("labels run statuses without inventing narratives", () => {
    expect(aiRunStatusPresentation("SUCCEEDED").tone).toBe("success");
    expect(aiRunStatusPresentation("UNAVAILABLE").tone).toBe("warning");
    expect(aiRunStatusPresentation("FAILED").label).toBe("Failed");
  });

  it("formats grounding reasons for evidence traceability", () => {
    expect(formatGroundingReasons(["RESTRICTED_LANGUAGE", "NO_REFERENCES"])).toMatch(
      /audit|credit-rating|no metric/i,
    );
  });
});
