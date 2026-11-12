const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3001/api/v1";

let csrfToken: string | null = null;

export function apiBase(): string {
  return API_BASE;
}

export async function ensureCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }
  const response = await fetch(`${API_BASE}/auth/csrf`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Unable to obtain CSRF token");
  }
  const body = (await response.json()) as { csrfToken: string };
  csrfToken = body.csrfToken;
  return csrfToken;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (method !== "GET" && method !== "HEAD") {
    const token = await ensureCsrfToken();
    headers.set("x-csrf-token", token);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });

  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : (null as T);
  return { status: response.status, body };
}

export function resetCsrfToken(): void {
  csrfToken = null;
}
