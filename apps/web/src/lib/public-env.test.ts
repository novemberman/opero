import { describe, expect, it } from "vitest";
import { SAME_ORIGIN_API_BASE_URL } from "./api-proxy";
import {
  DEFAULT_API_BASE_URL,
  getPublicEnvForInjection,
  normalizeApiBaseUrl,
  preferSameOriginApi,
  readApiBaseUrlFromProcessEnv,
  resolveApiBaseUrl,
} from "./public-env";

describe("normalizeApiBaseUrl", () => {
  it("keeps an explicit /api/v1 suffix", () => {
    expect(normalizeApiBaseUrl("https://api.example.com/api/v1")).toBe(
      "https://api.example.com/api/v1",
    );
    expect(normalizeApiBaseUrl("https://api.example.com/api/v1/")).toBe(
      "https://api.example.com/api/v1",
    );
  });

  it("appends /api/v1 when only an origin is provided", () => {
    expect(normalizeApiBaseUrl("https://opero-staging.up.railway.app")).toBe(
      "https://opero-staging.up.railway.app/api/v1",
    );
  });

  it("keeps same-origin relative paths", () => {
    expect(normalizeApiBaseUrl("/api/v1")).toBe("/api/v1");
    expect(normalizeApiBaseUrl("/api/v1/")).toBe("/api/v1");
  });

  it("falls back for empty input", () => {
    expect(normalizeApiBaseUrl("   ")).toBe(SAME_ORIGIN_API_BASE_URL);
  });
});

describe("resolveApiBaseUrl", () => {
  it("prefers injected window config over process env", () => {
    expect(
      resolveApiBaseUrl({
        windowEnv: { apiBaseUrl: "https://from-window.example/api/v1" },
        processEnv: { NEXT_PUBLIC_API_BASE_URL: "https://from-env.example/api/v1" },
      }),
    ).toBe("https://from-window.example/api/v1");
  });

  it("defaults to same-origin /api/v1 for browser cookie auth", () => {
    expect(
      resolveApiBaseUrl({
        windowEnv: null,
        processEnv: { NEXT_PUBLIC_API_BASE_URL: "https://opero-staging.up.railway.app" },
      }),
    ).toBe(SAME_ORIGIN_API_BASE_URL);
  });

  it("allows absolute cross-origin only when same-origin mode is disabled", () => {
    expect(
      resolveApiBaseUrl({
        windowEnv: null,
        processEnv: {
          NEXT_PUBLIC_API_SAME_ORIGIN: "false",
          NEXT_PUBLIC_API_BASE_URL: "https://opero-staging.up.railway.app",
        },
      }),
    ).toBe("https://opero-staging.up.railway.app/api/v1");
  });

  it("defaults to same-origin when unset", () => {
    expect(resolveApiBaseUrl({ windowEnv: null, processEnv: {} })).toBe(SAME_ORIGIN_API_BASE_URL);
  });
});

describe("getPublicEnvForInjection", () => {
  it("injects same-origin /api/v1 by default even if an absolute API URL is set", () => {
    expect(
      getPublicEnvForInjection({
        NEXT_PUBLIC_API_BASE_URL: "https://opero-staging.up.railway.app",
        API_PROXY_TARGET: "https://opero-staging.up.railway.app",
      }),
    ).toEqual({ apiBaseUrl: SAME_ORIGIN_API_BASE_URL });
  });

  it("can inject an absolute URL when same-origin mode is explicitly disabled", () => {
    expect(
      getPublicEnvForInjection({
        NEXT_PUBLIC_API_SAME_ORIGIN: "false",
        NEXT_PUBLIC_API_BASE_URL: "https://opero-staging.up.railway.app",
      }),
    ).toEqual({ apiBaseUrl: "https://opero-staging.up.railway.app/api/v1" });
  });
});

describe("preferSameOriginApi", () => {
  it("is enabled by default", () => {
    expect(preferSameOriginApi({})).toBe(true);
    expect(preferSameOriginApi({ NEXT_PUBLIC_API_SAME_ORIGIN: "false" })).toBe(false);
  });
});

describe("readApiBaseUrlFromProcessEnv", () => {
  it("does not require static NEXT_PUBLIC_* property access", () => {
    expect(
      readApiBaseUrlFromProcessEnv({
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:3001/api/v1",
      }),
    ).toBe("http://127.0.0.1:3001/api/v1");
  });

  it("keeps DEFAULT_API_BASE_URL for absolute escape-hatch fallbacks", () => {
    expect(DEFAULT_API_BASE_URL).toBe("http://127.0.0.1:3001/api/v1");
  });
});
