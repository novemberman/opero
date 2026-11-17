import { expect, test } from "@playwright/test";

/**
 * Browser acceptance for the M4/M5 financial intelligence UI journey.
 * Uses design-system specimens (synthetic fixtures) — no live tenant data,
 * no production API, no payments.
 */
test.describe("Financial intelligence UI journey", () => {
  test("diagnostics → BHS → AI interpretation → report lifecycle fixtures", async ({ page }) => {
    await page.goto("/design-system/diagnostics");

    await expect(page.getByTestId("fixture-diagnostics-overview")).toBeVisible();
    await expect(page.getByTestId("health-score-panel").first()).toBeVisible();
    await expect(page.getByTestId("fixture-health-score")).toContainText("Business Health Score");
    await expect(page.getByTestId("fixture-withheld-score")).toBeVisible();
    await expect(page.getByTestId("metric-dimension-sections")).toBeVisible();
    await expect(page.getByTestId("finding-card")).toBeVisible();

    await expect(page.getByTestId("fixture-ai")).toBeVisible();
    await expect(page.getByTestId("ai-availability-banner")).toBeVisible();
    await expect(page.getByTestId("narrative-panel")).toContainText("ai.interpret.v2");
    await expect(page.getByTestId("narrative-view")).toContainText("Profitability");
    await expect(page.getByTestId("narrative-view")).toContainText("Liquidity");
    await expect(page.getByTestId("narrative-view")).toContainText("Recommendations");
    await expect(page.getByTestId("grounding-panel")).toContainText("GROSS_MARGIN");
    await expect(page.getByTestId("grounding-panel")).toContainText("1 flagged");

    await expect(page.getByTestId("fixture-report-lifecycle")).toBeVisible();
    await expect(page.getByTestId("report-generation-progress")).toBeVisible();
    await expect(page.getByTestId("report-status-panel")).toContainText("FREE_PREVIEW");
    await expect(page.getByTestId("report-status-panel")).toContainText("Score 72");
    await expect(page.getByTestId("report-download-locked")).toBeDisabled();
    await expect(page.getByTestId("report-cross-tenant-denial")).toBeVisible();

    await expect(page.getByTestId("fixture-error")).toContainText("Unable to load diagnostics");
  });

  test("missing-data withheld score does not invent a numeric overall", async ({ page }) => {
    await page.goto("/design-system/diagnostics");
    const withheld = page.getByTestId("fixture-withheld-score").getByTestId("health-score-panel");
    await expect(withheld).toBeVisible();
    const kind = await withheld.getAttribute("data-score-kind");
    expect(kind).toBe("withheld");
    await expect(withheld).toContainText("Score withheld");
    await expect(withheld).toContainText("Insufficient data");
  });
});
