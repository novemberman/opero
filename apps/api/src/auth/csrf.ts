import { doubleCsrf } from "csrf-csrf";
import type { NextFunction, Request, Response } from "express";
import { resolveCookieSecure, type ApiEnv } from "../config/env";

export type CsrfHelpers = {
  generateCsrfToken: (req: Request, res: Response) => string;
  doubleCsrfProtection: (req: Request, res: Response, next: NextFunction) => void;
};

export function createCsrf(
  env: Pick<
    ApiEnv,
    "CSRF_SECRET" | "CSRF_COOKIE_NAME" | "NODE_ENV" | "SESSION_COOKIE_NAME" | "COOKIE_SECURE" | "COOKIE_DOMAIN"
  >,
): CsrfHelpers {
  const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
    getSecret: () => env.CSRF_SECRET,
    getSessionIdentifier: (req: Request) => {
      const sessionCookie =
        (req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined) ?? "anonymous";
      return sessionCookie;
    },
    cookieName: env.CSRF_COOKIE_NAME,
    // SameSite=Lax is correct for same-site / same-origin browser traffic.
    // Distinct *.up.railway.app hosts are cross-site; use the web same-origin
    // `/api/v1` proxy (or custom domains under one eTLD+1) instead of SameSite=None.
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: resolveCookieSecure(env),
      path: "/",
      ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    },
    getCsrfTokenFromRequest: (req: Request) =>
      (req.headers["x-csrf-token"] as string | undefined) ?? "",
  });

  return {
    generateCsrfToken: (req: Request, res: Response) => generateCsrfToken(req, res),
    doubleCsrfProtection: (req, res, next) => {
      doubleCsrfProtection(req, res, next);
    },
  };
}
