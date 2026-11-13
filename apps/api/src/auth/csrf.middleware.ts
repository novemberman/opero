import {
  ForbiddenException,
  Injectable,
  NestMiddleware,
} from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { CsrfService } from "./csrf.service";

const CSRF_EXEMPT_SUFFIXES = [
  "/health",
  "/ready",
  "/auth/csrf",
  "/auth/register",
  "/auth/login",
  "/auth/verify-email",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/invitations/accept-public",
  "/docs",
  // Korapay server-to-server webhooks (signature-verified, no browser CSRF).
  "/billing/webhooks/korapay",
  // Public enterprise quotation intake (no session required).
  "/billing/enterprise-quotes",
];

function isCsrfExempt(path: string): boolean {
  const normalized = path.split("?")[0] ?? path;
  return CSRF_EXEMPT_SUFFIXES.some(
    (suffix) =>
      normalized === suffix ||
      normalized.endsWith(suffix) ||
      normalized.startsWith(`${suffix}/`),
  );
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

    if (isCsrfExempt(req.path) || isCsrfExempt(req.originalUrl)) {
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
