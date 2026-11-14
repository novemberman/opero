import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureCsrfToken, resetCsrfToken, apiFetch } from "./api";

describe("api client CSRF handling", () => {
  afterEach(() => {
    resetCsrfToken();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("caches CSRF tokens from /auth/csrf with credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ csrfToken: "token-one" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureCsrfToken()).resolves.toBe("token-one");
    await expect(ensureCsrfToken()).resolves.toBe("token-one");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });

  it("sends x-csrf-token on mutating requests and retries once after CSRF failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: "stale-token" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ message: "Invalid CSRF token" }),
        clone() {
          return {
            text: async () => JSON.stringify({ message: "Invalid CSRF token" }),
          };
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: "fresh-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ organization: { id: "org-1" } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ organization: { id: string } }>("/organizations", {
      method: "POST",
      json: { name: "Acme", slug: "acme" },
    });

    expect(result.status).toBe(201);
    expect(result.body.organization.id).toBe("org-1");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const firstPostHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Headers;
    const retryPostHeaders = fetchMock.mock.calls[3]?.[1]?.headers as Headers;
    expect(firstPostHeaders.get("x-csrf-token")).toBe("stale-token");
    expect(retryPostHeaders.get("x-csrf-token")).toBe("fresh-token");
  });

  it("resetCsrfToken forces a new CSRF fetch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: "first" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: "second" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureCsrfToken()).resolves.toBe("first");
    resetCsrfToken();
    await expect(ensureCsrfToken()).resolves.toBe("second");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
