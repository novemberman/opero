import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PrismaClient } from "@opero/database";
import type { Response } from "express";
import { resolveCookieSecure, type ApiEnv } from "../config/env";
import { PRISMA_CLIENT } from "../database/database.constants";
import { generateOpaqueToken, hashToken } from "../security/tokens";
import type { AuthenticatedUser } from "../types/express";

@Injectable()
export class SessionService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly config: ConfigService<ApiEnv, true>,
  ) {}

  cookieName(): string {
    return this.config.get("SESSION_COOKIE_NAME", { infer: true });
  }

  private cookieSecure(): boolean {
    return resolveCookieSecure({
      NODE_ENV: this.config.get("NODE_ENV", { infer: true }),
      COOKIE_SECURE: this.config.get("COOKIE_SECURE", { infer: true }),
    });
  }

  private cookieDomain(): string | undefined {
    return this.config.get("COOKIE_DOMAIN", { infer: true });
  }

  private ttlMs(): number {
    return this.config.get("SESSION_TTL_HOURS", { infer: true }) * 60 * 60 * 1000;
  }

  setSessionCookie(res: Response, rawToken: string, expiresAt: Date): void {
    res.cookie(this.cookieName(), rawToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.cookieSecure(),
      path: "/",
      expires: expiresAt,
      ...(this.cookieDomain() ? { domain: this.cookieDomain() } : {}),
    });
  }

  clearSessionCookie(res: Response): void {
    res.clearCookie(this.cookieName(), {
      httpOnly: true,
      sameSite: "lax",
      secure: this.cookieSecure(),
      path: "/",
      ...(this.cookieDomain() ? { domain: this.cookieDomain() } : {}),
    });
  }

  async createSession(input: {
    userId: string;
    ip?: string;
    userAgent?: string;
    rotatedFromId?: string;
  }): Promise<{ rawToken: string; sessionId: string; expiresAt: Date }> {
    const rawToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.ttlMs());
    const session = await this.prisma.session.create({
      data: {
        userId: input.userId,
        tokenHash: hashToken(rawToken),
        expiresAt,
        ip: input.ip,
        userAgent: input.userAgent,
        rotatedFromId: input.rotatedFromId,
      },
    });
    return { rawToken, sessionId: session.id, expiresAt };
  }

  async resolveSession(
    rawToken: string | undefined,
  ): Promise<{ user: AuthenticatedUser; sessionId: string } | null> {
    if (!rawToken) {
      return null;
    }
    const tokenHash = hashToken(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return {
      sessionId: session.id,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        emailVerifiedAt: session.user.emailVerifiedAt,
      },
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
