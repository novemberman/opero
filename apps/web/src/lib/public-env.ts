/**
 * Browser-visible public config. Injected by the root layout at request time so
 * Docker/Railway images do not need NEXT_PUBLIC_* values at `next build`.
 */
export type OperoPublicEnv = {
  apiBaseUrl: string;
};

export const OPERO_PUBLIC_ENV_GLOBAL = "__OPERO_PUBLIC_ENV__";

export const DEFAULT_API_BASE_URL = "http://127.0.0.1:3001/api/v1";

declare global {
  interface Window {
    [OPERO_PUBLIC_ENV_GLOBAL]?: OperoPublicEnv;
  }
}

/**
 * Normalize an API origin or base URL to include the `/api/v1` prefix.
 * Accepts either `https://api.example.com` or `https://api.example.com/api/v1`.
 */
export function normalizeApiBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return DEFAULT_API_BASE_URL;
  }
  if (/\/api\/v1$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/api/v1`;
}

type EnvMap = Record<string, string | undefined>;

/**
 * Read API base URL from the server process environment without static
 * `process.env.NEXT_PUBLIC_*` access (which Next.js inlines at build time).
 */
export function readApiBaseUrlFromProcessEnv(env: EnvMap = process.env): string | undefined {
  const value = env["NEXT_PUBLIC_API_BASE_URL"]?.trim() || env["API_BASE_URL"]?.trim();
  return value || undefined;
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

  const fromProcess = readApiBaseUrlFromProcessEnv(options?.processEnv ?? process.env);
  if (fromProcess) {
    return normalizeApiBaseUrl(fromProcess);
  }

  return DEFAULT_API_BASE_URL;
}

export function getPublicEnvForInjection(env: EnvMap = process.env): OperoPublicEnv {
  return {
    apiBaseUrl: resolveApiBaseUrl({ processEnv: env, windowEnv: null }),
  };
}
