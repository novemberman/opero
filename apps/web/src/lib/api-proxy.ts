/**
 * Same-origin API proxy helpers.
 *
 * Staging/production browser traffic must call `/api/v1` on the web origin so
 * session + CSRF cookies are first-party. The web server forwards to the API.
 * Direct browser → API calls across distinct `*.up.railway.app` hosts are
 * cross-site; SameSite=Lax cookies are omitted on POST and CSRF fails.
 */

export const SAME_ORIGIN_API_BASE_URL = "/api/v1";
export const DEFAULT_API_PROXY_TARGET = "http://127.0.0.1:3001";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

type EnvMap = Record<string, string | undefined>;

/** Normalize an API origin or base URL to a bare origin (no `/api/v1`). */
export function normalizeApiProxyTarget(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return DEFAULT_API_PROXY_TARGET;
  }
  const withoutApi = trimmed.replace(/\/api\/v1$/i, "");
  return withoutApi || DEFAULT_API_PROXY_TARGET;
}

/**
 * Upstream API origin for the same-origin proxy.
 * Prefer `API_PROXY_TARGET` (server-only). Falls back to API_BASE_URL /
 * NEXT_PUBLIC_API_BASE_URL for local convenience, then loopback.
 */
export function resolveApiProxyTarget(env: EnvMap = process.env): string {
  const raw =
    env.API_PROXY_TARGET?.trim() ||
    env.API_BASE_URL?.trim() ||
    env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    DEFAULT_API_PROXY_TARGET;
  return normalizeApiProxyTarget(raw);
}

/** Build the upstream URL for a proxied `/api/v1/...` request. */
export function buildUpstreamApiUrl(
  pathSegments: string[],
  search = "",
  env: EnvMap = process.env,
): string {
  const target = resolveApiProxyTarget(env);
  const suffix = pathSegments.map(encodeURIComponent).join("/");
  const base = suffix ? `${target}/api/v1/${suffix}` : `${target}/api/v1`;
  return `${base}${search}`;
}

/** Request headers safe to forward to the API upstream. */
export function filterProxyRequestHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    headers.set(key, value);
  });
  return headers;
}

/**
 * Strip Domain from Set-Cookie so the browser binds the cookie to the web
 * host (the proxy origin), not the upstream API host.
 */
export function stripSetCookieDomain(setCookie: string): string {
  return setCookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^domain=/i.test(part))
    .join("; ");
}

export function collectUpstreamSetCookies(headers: Headers): string[] {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}
