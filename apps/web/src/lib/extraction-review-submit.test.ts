import { afterEach, describe, expect, it, vi } from "vitest";
import { resetCsrfToken } from "./api";
import {
  buildExtractionReviewRequest,
  classifyReviewHttpFailure,
  submitExtractionReview,
  validateExtractionReviewInput,
} from "./extraction-review-submit";

const ORG = "6693e901-9051-49bc-82a6-20094835432c";
const DOC = "cc04b221-06c6-41da-b016-213753ca2a08";
const REVENUE = "f6da2815-5e54-461c-ae35-0fed50d020d1";

describe("extraction-review-submit", () => {
  afterEach(() => {
    resetCsrfToken();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds Revenue CONFIRM POST with org/document/line ids and no newValue", () => {
    const req = buildExtractionReviewRequest(
      { orgId: ORG, documentId: DOC },
      { lineItemId: REVENUE, action: "CONFIRM", reason: "ACTUAL NGN" },
    );
    expect(req.method).toBe("POST");
    expect(req.path).toBe(`/organizations/${ORG}/documents/${DOC}/review`);
    expect(req.json).toEqual({
      lineItemId: REVENUE,
      action: "CONFIRM",
      newValue: undefined,
      reason: "ACTUAL NGN",
    });
  });

  it("rejects CONFIRM with a filled correction and CORRECT without a value", () => {
    expect(
      validateExtractionReviewInput({
        lineItemId: REVENUE,
        action: "CONFIRM",
        newValue: "999",
      }),
    ).toMatch(/Correct & confirm/);
    expect(
      validateExtractionReviewInput({
        lineItemId: REVENUE,
        action: "CORRECT",
      }),
    ).toMatch(/requires a corrected/);
  });

  it("issues authenticated CSRF-backed POST and requires persisted CONFIRMED lineItem", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: "csrf-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            lineItem: {
              id: REVENUE,
              reviewStatus: "CONFIRMED",
              unitScaleRequiresReview: false,
              normalizedValue: "1250000",
            },
          }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitExtractionReview(
      { orgId: ORG, documentId: DOC },
      { lineItemId: REVENUE, action: "CONFIRM" },
    );

    expect(result).toEqual({
      ok: true,
      lineItemId: REVENUE,
      reviewStatus: "CONFIRMED",
      unitScaleRequiresReview: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/auth\/csrf$/);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });

    const postUrl = String(fetchMock.mock.calls[1]?.[0]);
    const postInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(postUrl).toContain(`/organizations/${ORG}/documents/${DOC}/review`);
    expect(postInit.method).toBe("POST");
    expect(postInit.credentials).toBe("include");
    const headers = postInit.headers as Headers;
    expect(headers.get("x-csrf-token")).toBe("csrf-token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(String(postInit.body))).toEqual({
      lineItemId: REVENUE,
      action: "CONFIRM",
    });
  });

  it("does not report success when the server omits lineItem (no false CONFIRMED)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: "csrf-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ message: "ok" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitExtractionReview(
      { orgId: ORG, documentId: DOC },
      { lineItemId: REVENUE, action: "CONFIRM" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INCOMPLETE");
    }
  });

  it("surfaces expired session and cross-tenant failures clearly", () => {
    expect(classifyReviewHttpFailure(401, {}).message).toMatch(/session has expired/i);
    expect(classifyReviewHttpFailure(401, {}).code).toBe("UNAUTHORIZED");
    expect(classifyReviewHttpFailure(404, {}).code).toBe("NOT_FOUND");
    expect(classifyReviewHttpFailure(403, { message: "Forbidden" }).message).toBe("Forbidden");
  });

  it("returns NETWORK errors without claiming persistence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Unable to obtain CSRF token")),
    );
    const result = await submitExtractionReview(
      { orgId: ORG, documentId: DOC },
      { lineItemId: REVENUE, action: "CONFIRM" },
    );
    expect(result).toMatchObject({ ok: false, code: "NETWORK" });
  });

  it("does not mutate sibling figure ids in the request body", () => {
    const other = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const req = buildExtractionReviewRequest(
      { orgId: ORG, documentId: DOC },
      { lineItemId: REVENUE, action: "CONFIRM" },
    );
    expect(req.json.lineItemId).toBe(REVENUE);
    expect(JSON.stringify(req.json)).not.toContain(other);
  });
});
