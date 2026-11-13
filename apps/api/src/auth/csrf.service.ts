import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NextFunction, Request, Response } from "express";
import type { ApiEnv } from "../config/env";
import { createCsrf, type CsrfHelpers } from "./csrf";

@Injectable()
export class CsrfService {
  private readonly helpers: CsrfHelpers;

  constructor(config: ConfigService<ApiEnv, true>) {
    this.helpers = createCsrf({
      CSRF_SECRET: config.get("CSRF_SECRET", { infer: true }),
      CSRF_COOKIE_NAME: config.get("CSRF_COOKIE_NAME", { infer: true }),
      NODE_ENV: config.get("NODE_ENV", { infer: true }),
      SESSION_COOKIE_NAME: config.get("SESSION_COOKIE_NAME", { infer: true }),
      COOKIE_SECURE: config.get("COOKIE_SECURE", { infer: true }),
      COOKIE_DOMAIN: config.get("COOKIE_DOMAIN", { infer: true }),
    });
  }

  issueToken(req: Request, res: Response): string {
    return this.helpers.generateCsrfToken(req, res);
  }

  get protection(): (req: Request, res: Response, next: NextFunction) => void {
    return this.helpers.doubleCsrfProtection;
  }
}
