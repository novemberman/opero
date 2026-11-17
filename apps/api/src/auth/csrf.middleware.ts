import {
  ForbiddenException,
  Injectable,
  NestMiddleware,
} from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { CsrfService } from "./csrf.service";

/**
 * Paths relative to the `/api/v1` global prefix (also accepted with the prefix).
 * Nested children are allowed only when `nested` is true.
 */
const CSRF_EXEMPT_ROUTES: Array<{ path: string; nested?: boolean }> = [
  { path: "/health" },
  { path: "/ready" },
  { path: "/auth/csrf" },
  { path: "/auth/register" },
  { path: "/auth/login" },
  { path: "/auth/verify-email" },
  { path: "/auth/forgot-password" },
  { path: "/auth/reset-password" },
  // Ops-issued pilot bootstrap accept (single-use token; no session yet).
  { path: "/auth/pilot-invitations/accept" },
  { path: "/invitations/accept-public" },
  { path: "/docs", nested: true },
  // Korapay server-to-server webhooks (signature-verified, no browser CSRF).
  { path: "/billing/webhooks/korapay" },
  // Public enterprise quotation intake (no session required).
  { path: "/billing/enterprise-quotes" },
  // Ops pilot invitation admin (OPS_STATUS_TOKEN gated; no browser session).
  { path: "/ops/pilot-invitations", nested: true },
  // Ops synthetic entitlement admin (dual ops+confirmation tokens; no browser session).
  { path: "/ops/synthetic-entitlements", nested: true },
];

/** Normalize to an `/api/v1`-relative path beginning with `/`. */
function toApiRelativePath(rawPath: string): string {
  const withoutQuery = (rawPath.split("?")[0] ?? rawPath).replace(/\/+$/, "") || "/";
  if (withoutQuery === "/api/v1" || withoutQuery.startsWith("/api/v1/")) {
    const rest = withoutQuery.slice("/api/v1".length);
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
}

/**
 * Exact allowlist match (optionally nested children). Does not use substring
 * `includes` / bare `endsWith`, which previously could exempt unrelated paths.
 */
export function isCsrfExemptPath(rawPath: string): boolean {
  const relative = toApiRelativePath(rawPath);
  return CSRF_EXEMPT_ROUTES.some(({ path, nested }) => {
    if (relative === path) return true;
    return Boolean(nested && relative.startsWith(`${path}/`));
  });
}

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(private readonly csrf: CsrfService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const method = req.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      next();
      return;
    }

    if (isCsrfExemptPath(req.path) || isCsrfExemptPath(req.originalUrl)) {
      next();
      return;
    }

    this.csrf.protection(req, res, (error?: unknown) => {
      if (error) {
        next(new ForbiddenException("Invalid CSRF token"));
        return;
      }
      next();
    });
  }
}
