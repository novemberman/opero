import {
  buildUpstreamApiUrl,
  collectUpstreamSetCookies,
  filterProxyRequestHeaders,
  stripSetCookieDomain,
} from "../../../../lib/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxyRequest(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const upstreamUrl = buildUpstreamApiUrl(path, incoming.search);

  const headers = filterProxyRequestHeaders(request.headers);
  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  const upstreamInit: RequestInit & { duplex?: "half" } = {
    method,
    headers,
    redirect: "manual",
  };

  if (hasBody && request.body) {
    upstreamInit.body = request.body;
    upstreamInit.duplex = "half";
  }

  const upstream = await fetch(upstreamUrl, upstreamInit);

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "set-cookie") return;
    if (HOP_BY_HOP_RESPONSE.has(lower)) return;
    responseHeaders.set(key, value);
  });

  const response = new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });

  for (const cookie of collectUpstreamSetCookies(upstream.headers)) {
    response.headers.append("set-cookie", stripSetCookieDomain(cookie));
  }

  return response;
}

const HOP_BY_HOP_RESPONSE = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
]);

export function GET(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}

export function HEAD(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}

export function POST(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}

export function PUT(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}

export function PATCH(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}

export function DELETE(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}

export function OPTIONS(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}
