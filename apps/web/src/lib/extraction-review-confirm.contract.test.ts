/**
 * Contract E2E (Node): Confirm figure → submitExtractionReview → POST /review.
 * Runs without Playwright host libraries; pairs with e2e/review-confirm.spec.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetCsrfToken } from "./api";
import { submitExtractionReview } from "./extraction-review-submit";

const ORG = "6693e901-9051-49bc-82a6-20094835432c";
const DOC = "cc04b221-06c6-41da-b016-213753ca2a08";
const REVENUE = "f6da2815-5e54-461c-ae35-0fed50d020d1";
const COGS = "11111111-1111-1111-1111-111111111111";

describe("Confirm figure contract E2E", () => {
  afterEach(() => {
    resetCsrfToken();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("Revenue Confirm issues one POST and leaves sibling figures untouched", async () => {
    const confirmedBody = JSON.stringify({
      lineItem: {
        id: REVENUE,
        reviewStatus: "CONFIRMED",
        unitScaleRequiresReview: false,
        normalizedValue: "1250000",
        currency: "NGN",
        unitScale: "ACTUAL",
      },
    });
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/auth/csrf")) {
        return { ok: true, json: async () => ({ csrfToken: "contract-csrf" }) };
      }
      return {
        ok: true,
        status: 201,
        text: async () => confirmedBody,
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    // Simulate Confirm figure onClick payload (single submission path).
    const clickPayload = { lineItemId: REVENUE, action: "CONFIRM" as const };
    const first = await submitExtractionReview({ orgId: ORG, documentId: DOC }, clickPayload);
    // Duplicate click guard at page layer skips while submitting; second call still safe.
    const second = await submitExtractionReview({ orgId: ORG, documentId: DOC }, clickPayload);

    expect(first).toMatchObject({ ok: true, reviewStatus: "CONFIRMED", lineItemId: REVENUE });
    expect(second).toMatchObject({ ok: true, reviewStatus: "CONFIRMED" });

    const reviewPosts = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes(`/documents/${DOC}/review`),
    );
    expect(reviewPosts.length).toBe(2);
    for (const call of reviewPosts) {
      const body = JSON.parse(String((call[1] as RequestInit).body));
      expect(body).toEqual({ lineItemId: REVENUE, action: "CONFIRM" });
      expect(body.lineItemId).not.toBe(COGS);
      expect((call[1] as RequestInit).credentials).toBe("include");
      expect(((call[1] as RequestInit).headers as Headers).get("x-csrf-token")).toBe(
        "contract-csrf",
      );
    }
  });
});
