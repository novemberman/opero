import { resolveApiBaseUrl } from "./public-env";

let csrfToken: string | null = null;

export function apiBase(): string {
  return resolveApiBaseUrl();
}

export async function ensureCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }
  const response = await fetch(`${apiBase()}/auth/csrf`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Unable to obtain CSRF token");
  }
  const body = (await response.json()) as { csrfToken: string };
  csrfToken = body.csrfToken;
  return csrfToken;
}

async function parseResponseBody<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return null as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown; formData?: FormData } = {},
): Promise<{ status: number; body: T }> {
  const method = (init.method ?? "GET").toUpperCase();
  const buildHeaders = async (): Promise<Headers> => {
    const headers = new Headers(init.headers);
    if (init.json !== undefined) {
      headers.set("content-type", "application/json");
    }
    if (method !== "GET" && method !== "HEAD") {
      const token = await ensureCsrfToken();
      headers.set("x-csrf-token", token);
    }
    return headers;
  };

  const body =
    init.formData !== undefined
      ? init.formData
      : init.json !== undefined
        ? JSON.stringify(init.json)
        : init.body;

  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: await buildHeaders(),
    credentials: "include",
    body,
  });

  // One retry after CSRF rejection when the body can be safely resent (not FormData).
  const canRetryBody = init.formData === undefined;
  if (
    response.status === 403 &&
    canRetryBody &&
    method !== "GET" &&
    method !== "HEAD"
  ) {
    const failedBody = await parseResponseBody<{ message?: string }>(response.clone());
    const message = typeof failedBody?.message === "string" ? failedBody.message : "";
    if (/csrf/i.test(message)) {
      resetCsrfToken();
      const retry = await fetch(`${apiBase()}${path}`, {
        ...init,
        headers: await buildHeaders(),
        credentials: "include",
        body,
      });
      return { status: retry.status, body: await parseResponseBody<T>(retry) };
    }
  }

  return { status: response.status, body: await parseResponseBody<T>(response) };
}

/**
 * Fetches a binary resource (e.g. a report PDF) with the session cookie.
 * On failure the API's JSON error message is returned instead of a blob.
 */
export async function apiDownload(
  path: string,
): Promise<{ status: number; blob: Blob | null; message: string | null }> {
  const response = await fetch(`${apiBase()}${path}`, { credentials: "include" });
  if (!response.ok) {
    let message: string | null = null;
    try {
      message = apiErrorMessage(await response.json(), "");
    } catch {
      message = null;
    }
    return { status: response.status, blob: null, message: message || null };
  }
  return { status: response.status, blob: await response.blob(), message: null };
}

/** Reads the error text of an API response body, including validation issues. */
export function apiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const { message, issues } = body as { message?: unknown; issues?: unknown };
  const text = Array.isArray(message)
    ? message.filter((part): part is string => typeof part === "string").join("; ")
    : typeof message === "string"
      ? message
      : "";
  const details = Array.isArray(issues)
    ? issues
        .map((issue) => {
          if (!issue || typeof issue !== "object") return "";
          const { path, message: detail } = issue as { path?: unknown; message?: unknown };
          if (typeof detail !== "string") return "";
          return typeof path === "string" && path ? `${path}: ${detail}` : detail;
        })
        .filter(Boolean)
    : [];
  if (!text) return details.length ? details.join("; ") : fallback;
  return details.length ? `${text} (${details.join("; ")})` : text;
}

export function resetCsrfToken(): void {
  csrfToken = null;
}
