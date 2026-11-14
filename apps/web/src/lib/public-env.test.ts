import { describe, expect, it } from "vitest";
import {
  DEFAULT_API_BASE_URL,
  getPublicEnvForInjection,
  normalizeApiBaseUrl,
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

  it("falls back for empty input", () => {
    expect(normalizeApiBaseUrl("   ")).toBe(DEFAULT_API_BASE_URL);
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

  it("reads NEXT_PUBLIC_API_BASE_URL dynamically from process env", () => {
    expect(
      resolveApiBaseUrl({
        windowEnv: null,
        processEnv: { NEXT_PUBLIC_API_BASE_URL: "https://opero-staging.up.railway.app" },
      }),
    ).toBe("https://opero-staging.up.railway.app/api/v1");
  });

  it("supports API_BASE_URL as a non-public alias", () => {
    expect(
      resolveApiBaseUrl({
        windowEnv: null,
        processEnv: { API_BASE_URL: "https://api.example.com/api/v1" },
      }),
    ).toBe("https://api.example.com/api/v1");
  });

  it("defaults to local development when unset", () => {
    expect(resolveApiBaseUrl({ windowEnv: null, processEnv: {} })).toBe(DEFAULT_API_BASE_URL);
  });
});

describe("getPublicEnvForInjection", () => {
  it("exposes a normalized apiBaseUrl for the inline script", () => {
    expect(
      getPublicEnvForInjection({
        NEXT_PUBLIC_API_BASE_URL: "https://opero-staging.up.railway.app",
      }),
    ).toEqual({ apiBaseUrl: "https://opero-staging.up.railway.app/api/v1" });
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
});
