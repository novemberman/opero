import { expect, test, type Page } from "@playwright/test";

const ORG = "6693e901-9051-49bc-82a6-20094835432c";
const DOC = "cc04b221-06c6-41da-b016-213753ca2a08";
const REVENUE = "f6da2815-5e54-461c-ae35-0fed50d020d1";

const SESSION_EXPIRED =
  "Your session has expired. Please sign in again. Your confirmation was not saved.";

async function mockReviewApis(
  page: Page,
  options?: { failStatus?: number; delayMs?: number },
) {
  const posts: Array<{ url: string; body: unknown; headers: Record<string, string> }> = [];

  await page.route("**/api/v1/auth/csrf", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ csrfToken: "e2e-csrf-token" }),
    });
  });

  await page.route(`**/api/v1/organizations/${ORG}/documents/${DOC}/review`, async (route) => {
    const request = route.request();
    posts.push({
      url: request.url(),
      body: request.postDataJSON(),
      headers: request.headers(),
    });
    if (options?.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
    if (options?.failStatus) {
      await route.fulfill({
        status: options.failStatus,
        contentType: "application/json",
        body: JSON.stringify({
          message:
            options.failStatus === 401
              ? "Unauthorized"
              : "Review failed for test",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        lineItem: {
          id: REVENUE,
          reviewStatus: "CONFIRMED",
          unitScaleRequiresReview: false,
          normalizedValue: "1250000",
          currency: "NGN",
          unitScale: "ACTUAL",
        },
      }),
    });
  });

  return posts;
}

test.describe("Review Confirm figure E2E", () => {
  test("Confirm figure issues POST /review with CSRF and persists CONFIRMED", async ({
    page,
  }) => {
    const posts = await mockReviewApis(page);
    await page.goto("/design-system/review-confirm");
    await expect(page.getByTestId("review-confirm-specimen")).toBeVisible();
    await expect(page.getByTestId("confirm-figure")).toBeVisible();

    await page.getByTestId("confirm-figure").click();

    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]?.body).toEqual({ lineItemId: REVENUE, action: "CONFIRM" });
    expect(posts[0]?.headers["x-csrf-token"] || posts[0]?.headers["X-Csrf-Token"]).toBeTruthy();
    await expect(page.getByText("Figure confirmed", { exact: false })).toBeVisible();
    await expect(page.getByTestId("extraction-line-card")).toHaveAttribute(
      "data-review-status",
      "CONFIRMED",
    );
    await expect(page.getByTestId("sibling-pending-guard")).toContainText("PENDING");
  });

  test("failed review shows session-expiry copy and does not mark CONFIRMED", async ({
    page,
  }) => {
    await mockReviewApis(page, { failStatus: 401 });
    await page.goto("/design-system/review-confirm");
    await page.getByTestId("confirm-figure").click();
    await expect(page.getByText(SESSION_EXPIRED)).toBeVisible();
    await expect(page.getByTestId("extraction-line-card")).toHaveAttribute(
      "data-review-status",
      "PENDING",
    );
  });

  test("duplicate clicks while submitting issue a single review POST", async ({ page }) => {
    const posts = await mockReviewApis(page, { delayMs: 800 });
    await page.goto("/design-system/review-confirm");
    const confirm = page.getByTestId("confirm-figure");
    await confirm.click();
    await expect(confirm).toBeDisabled();
    await confirm.click({ force: true }).catch(() => undefined);
    await expect.poll(() => posts.length).toBe(1);
    await expect(page.getByTestId("extraction-line-card")).toHaveAttribute(
      "data-review-status",
      "CONFIRMED",
    );
  });
});
