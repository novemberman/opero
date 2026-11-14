import { describe, expect, it } from "vitest";
import {
  DEFAULT_API_PROXY_TARGET,
  SAME_ORIGIN_API_BASE_URL,
  buildUpstreamApiUrl,
  filterProxyRequestHeaders,
  normalizeApiProxyTarget,
  resolveApiProxyTarget,
  stripSetCookieDomain,
} from "./api-proxy";

describe("api proxy target", () => {
  it("defaults to loopback API origin", () => {
    expect(resolveApiProxyTarget({})).toBe(DEFAULT_API_PROXY_TARGET);
  });

  it("prefers API_PROXY_TARGET and strips /api/v1", () => {
    expect(
      resolveApiProxyTarget({
        API_PROXY_TARGET: "https://opero-staging.up.railway.app/api/v1",
        NEXT_PUBLIC_API_BASE_URL: "https://ignored.example/api/v1",
      }),
    ).toBe("https://opero-staging.up.railway.app");
  });

  it("builds upstream paths with encoded segments and query", () => {
    expect(buildUpstreamApiUrl(["auth", "csrf"], "", { API_PROXY_TARGET: "http://127.0.0.1:3001" })).toBe(
      "http://127.0.0.1:3001/api/v1/auth/csrf",
    );
    expect(
      buildUpstreamApiUrl(["organizations", "a b"], "?x=1", {
        API_PROXY_TARGET: "https://api.example.com",
      }),
    ).toBe("https://api.example.com/api/v1/organizations/a%20b?x=1");
  });

  it("normalizes bare origins", () => {
    expect(normalizeApiProxyTarget("https://api.example.com/")).toBe("https://api.example.com");
  });
});

describe("Set-Cookie domain stripping", () => {
  it("removes Domain so cookies bind to the web (proxy) host", () => {
    expect(
      stripSetCookieDomain(
        "opero_session=abc; Path=/; HttpOnly; Secure; SameSite=Lax; Domain=opero-staging.up.railway.app",
      ),
    ).toBe("opero_session=abc; Path=/; HttpOnly; Secure; SameSite=Lax");
  });

  it("leaves host-only cookies unchanged", () => {
    expect(stripSetCookieDomain("opero_csrf=tok; Path=/; HttpOnly; SameSite=Lax")).toBe(
      "opero_csrf=tok; Path=/; HttpOnly; SameSite=Lax",
    );
  });
});

describe("proxy request header filtering", () => {
  it("forwards cookie and CSRF headers but not Host", () => {
    const source = new Headers({
      host: "opero-web-staging.up.railway.app",
      cookie: "opero_session=abc; opero_csrf=tok",
      "x-csrf-token": "tok",
      "content-type": "application/json",
      connection: "keep-alive",
    });
    const filtered = filterProxyRequestHeaders(source);
    expect(filtered.get("cookie")).toBe("opero_session=abc; opero_csrf=tok");
    expect(filtered.get("x-csrf-token")).toBe("tok");
    expect(filtered.get("content-type")).toBe("application/json");
    expect(filtered.get("host")).toBeNull();
    expect(filtered.get("connection")).toBeNull();
  });
});

describe("same-origin browser base", () => {
  it("exports the stable same-origin API prefix", () => {
    expect(SAME_ORIGIN_API_BASE_URL).toBe("/api/v1");
  });
});
