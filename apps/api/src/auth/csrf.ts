import { doubleCsrf } from "csrf-csrf";
import type { NextFunction, Request, Response } from "express";
import type { ApiEnv } from "../config/env";

export type CsrfHelpers = {
  generateCsrfToken: (req: Request, res: Response) => string;
  doubleCsrfProtection: (req: Request, res: Response, next: NextFunction) => void;
};

export function createCsrf(
  env: Pick<ApiEnv, "CSRF_SECRET" | "CSRF_COOKIE_NAME" | "NODE_ENV" | "SESSION_COOKIE_NAME">,
): CsrfHelpers {
  const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
    getSecret: () => env.CSRF_SECRET,
    getSessionIdentifier: (req: Request) => {
      const sessionCookie =
        (req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined) ?? "anonymous";
      return sessionCookie;
    },
    cookieName: env.CSRF_COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
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
