/**
 * Browser-visible public config. Injected by the root layout at request time so
 * Docker/Railway images do not need NEXT_PUBLIC_* values at `next build`.
 *
 * Default browser API base is same-origin `/api/v1` (proxied by the web app).
 * Absolute cross-origin API URLs break cookie auth on distinct Railway hosts
 * because SameSite=Lax cookies are not sent on cross-site POSTs.
 */
import { SAME_ORIGIN_API_BASE_URL } from "./api-proxy";

export type OperoPublicEnv = {
  apiBaseUrl: string;
};

export const OPERO_PUBLIC_ENV_GLOBAL = "__OPERO_PUBLIC_ENV__";

/** Loopback absolute URL for non-browser / legacy tooling when unset. */
export const DEFAULT_API_BASE_URL = "http://127.0.0.1:3001/api/v1";

declare global {
  interface Window {
    [OPERO_PUBLIC_ENV_GLOBAL]?: OperoPublicEnv;
  }
}

/**
 * Normalize an API origin, absolute base URL, or same-origin path to include
 * the `/api/v1` prefix.
 */
export function normalizeApiBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return SAME_ORIGIN_API_BASE_URL;
  }
  if (trimmed.startsWith("/")) {
    if (/\/api\/v1$/i.test(trimmed)) {
      return trimmed;
    }
    if (trimmed === "/") {
      return SAME_ORIGIN_API_BASE_URL;
    }
    return `${trimmed}/api/v1`;
  }
  if (/\/api\/v1$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/api/v1`;
}

type EnvMap = Record<string, string | undefined>;

/**
 * Read an explicit absolute API base URL from the server process environment.
 * Used only when same-origin mode is disabled.
 */
export function readApiBaseUrlFromProcessEnv(env: EnvMap = process.env): string | undefined {
  const value = env["NEXT_PUBLIC_API_BASE_URL"]?.trim() || env["API_BASE_URL"]?.trim();
  return value || undefined;
}

/**
 * Whether the browser should call the API on the web origin (`/api/v1`).
 * Disable only with `NEXT_PUBLIC_API_SAME_ORIGIN=false` plus an absolute
 * `NEXT_PUBLIC_API_BASE_URL` (not recommended on Railway default domains).
 */
export function preferSameOriginApi(env: EnvMap = process.env): boolean {
  const flag = env.NEXT_PUBLIC_API_SAME_ORIGIN?.trim().toLowerCase();
  if (flag === "false" || flag === "0") {
    return false;
  }
  return true;
}

export function resolveApiBaseUrl(options?: {
  windowEnv?: OperoPublicEnv | null;
  processEnv?: EnvMap;
}): string {
  const fromWindow = options?.windowEnv?.apiBaseUrl?.trim();
  if (fromWindow) {
    return normalizeApiBaseUrl(fromWindow);
  }

  if (typeof window !== "undefined") {
    const injected = window[OPERO_PUBLIC_ENV_GLOBAL]?.apiBaseUrl?.trim();
    if (injected) {
      return normalizeApiBaseUrl(injected);
    }
  }

  const processEnv = options?.processEnv ?? process.env;
  if (preferSameOriginApi(processEnv)) {
    return SAME_ORIGIN_API_BASE_URL;
  }

  const fromProcess = readApiBaseUrlFromProcessEnv(processEnv);
  if (fromProcess) {
    return normalizeApiBaseUrl(fromProcess);
  }

  return DEFAULT_API_BASE_URL;
}

export function getPublicEnvForInjection(env: EnvMap = process.env): OperoPublicEnv {
  if (preferSameOriginApi(env)) {
    return { apiBaseUrl: SAME_ORIGIN_API_BASE_URL };
  }
  const absolute = readApiBaseUrlFromProcessEnv(env);
  return {
    apiBaseUrl: absolute ? normalizeApiBaseUrl(absolute) : DEFAULT_API_BASE_URL,
  };
}
