import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import type { ApiEnv } from "../../config/env";

type Bucket = { count: number; resetAt: number };

/**
 * Login-specific rate limiter driven by ConfigService so tests can lower limits
 * without disabling protection globally, and production cannot set AUTH_THROTTLE_DISABLED.
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly config: ConfigService<ApiEnv, true>) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get("AUTH_THROTTLE_DISABLED", { infer: true })) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const limit = this.config.get("AUTH_LOGIN_THROTTLE_LIMIT", { infer: true });
    const ttlMs = this.config.get("AUTH_LOGIN_THROTTLE_TTL_MS", { infer: true });
    const key = `${req.ip ?? "unknown"}:login`;
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + ttlMs });
      res.setHeader("x-ratelimit-limit", String(limit));
      res.setHeader("x-ratelimit-remaining", String(Math.max(limit - 1, 0)));
      return true;
    }

    if (existing.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader("retry-after", String(retryAfter));
      res.setHeader("x-ratelimit-limit", String(limit));
      res.setHeader("x-ratelimit-remaining", "0");
      throw new HttpException("Too Many Requests", HttpStatus.TOO_MANY_REQUESTS);
    }

    existing.count += 1;
    res.setHeader("x-ratelimit-limit", String(limit));
    res.setHeader("x-ratelimit-remaining", String(Math.max(limit - existing.count, 0)));
    return true;
  }
}
