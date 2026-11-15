import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PrismaClient } from "@opero/database";
import type { Request, Response } from "express";
import { AuditService } from "../audit/audit.service";
import type { ApiEnv } from "../config/env";
import { PRISMA_CLIENT } from "../database/database.constants";
import { hashPassword, verifyPassword } from "../security/passwords";
import { timingSafeStringEqual } from "../security/timing-safe-equal";
import { generateOpaqueToken, hashToken } from "../security/tokens";
import { EmailPort } from "./email/email.port";
import { buildPasswordResetEmail, buildVerificationEmail } from "./email/email.templates";
import { SessionService } from "./session.service";

const GENERIC_AUTH_FAILURE = "Invalid email or password";
const GENERIC_TOKEN_FAILURE = "Invalid or expired token";
/** Stable Postgres advisory lock key for pilot user-cap serialization. */
const PILOT_USER_CAP_LOCK = 8_720_140_1;

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly sessions: SessionService,
    private readonly email: EmailPort,
    private readonly audit: AuditService,
    private readonly config: ConfigService<ApiEnv, true>,
  ) {}

  private appOrigin(): string {
    return this.config.get("APP_ORIGIN", { infer: true });
  }

  private tokenTtlHours(): number {
    return this.config.get("AUTH_TOKEN_TTL_HOURS", { infer: true });
  }

  private tokenTtlMs(): number {
    return this.tokenTtlHours() * 60 * 60 * 1000;
  }

  async register(input: {
    email: string;
    name: string;
    password: string;
    inviteCode?: string;
    requestId?: string;
  }): Promise<{ id: string; email: string; name: string }> {
    if (!this.config.get("PUBLIC_REGISTRATION_ENABLED", { infer: true })) {
      throw new ForbiddenException({
        message: "Public registration is disabled. Use an organization invitation to join.",
        code: "PUBLIC_REGISTRATION_DISABLED",
      });
    }

    const requiredInvite = this.config.get("PILOT_INVITE_CODE", { infer: true });
    if (requiredInvite) {
      const provided = input.inviteCode?.trim() ?? "";
      if (!provided || !timingSafeStringEqual(provided, requiredInvite)) {
        throw new ForbiddenException({
          message: "A valid invitation code is required to register.",
          code: "PILOT_INVITE_REQUIRED",
        });
      }
    }

    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);
    const rawToken = generateOpaqueToken();
    const maxUsers = this.config.get("PILOT_MAX_USERS", { infer: true });

    const user = await this.prisma.$transaction(async (tx) => {
      // Serialize pilot user-cap checks against concurrent registrations.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PILOT_USER_CAP_LOCK})`;
      if (maxUsers != null) {
        const userCount = await tx.user.count();
        if (userCount >= maxUsers) {
          throw new ForbiddenException({
            message: "Pilot user limit reached. Contact the operator for access.",
            code: "PILOT_USER_LIMIT",
          });
        }
      }

      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) {
        // Constant-looking response path: do not reveal that the email exists.
        throw new BadRequestException("Unable to register with the provided details");
      }

      const created = await tx.user.create({
        data: {
          email,
          name: input.name.trim(),
          passwordHash,
        },
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: created.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + this.tokenTtlMs()),
        },
      });
      return { id: created.id, email: created.email, name: created.name };
    });

    await this.email.send(
      buildVerificationEmail({
        to: user.email,
        appOrigin: this.appOrigin(),
        token: rawToken,
        ttlHours: this.tokenTtlHours(),
      }),
    );

    await this.audit.record({
      action: "auth.register",
      entityType: "user",
      entityId: user.id,
      actorUserId: user.id,
      requestId: input.requestId,
    });

    return { id: user.id, email: user.email, name: user.name };
  }

  async login(input: {
    email: string;
    password: string;
    req: Request;
    res: Response;
  }): Promise<{ id: string; email: string; name: string }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = user ? await verifyPassword(user.passwordHash, input.password) : false;
    if (!user || !valid || !user.emailVerifiedAt) {
      await this.audit.record({
        action: "auth.login_denied",
        entityType: "user",
        entityId: user?.id,
        actorUserId: user?.id,
        requestId: input.req.requestId,
        metadata: { reason: !user || !valid ? "credentials" : "unverified" },
      });
      throw new UnauthorizedException(GENERIC_AUTH_FAILURE);
    }

    // Session fixation / rotation: drop any pre-login session cookie before issuing a new one.
    const priorRaw = input.req.cookies?.[this.sessions.cookieName()] as string | undefined;
    const prior = await this.sessions.resolveSession(priorRaw);
    if (prior) {
      await this.sessions.revokeSession(prior.sessionId);
    }

    const session = await this.sessions.createSession({
      userId: user.id,
      ip: input.req.ip,
      userAgent: input.req.header("user-agent") ?? undefined,
      rotatedFromId: prior?.sessionId,
    });
    this.sessions.setSessionCookie(input.res, session.rawToken, session.expiresAt);

    await this.audit.record({
      action: "auth.login",
      entityType: "session",
      entityId: session.sessionId,
      actorUserId: user.id,
      requestId: input.req.requestId,
    });

    return { id: user.id, email: user.email, name: user.name };
  }

  async logout(req: Request, res: Response): Promise<void> {
    if (req.sessionId) {
      await this.sessions.revokeSession(req.sessionId);
      await this.audit.record({
        action: "auth.logout",
        entityType: "session",
        entityId: req.sessionId,
        actorUserId: req.user?.id,
        requestId: req.requestId,
      });
    }
    this.sessions.clearSessionCookie(res);
    this.sessions.clearCsrfCookie(res);
  }

  async verifyEmail(token: string, requestId?: string): Promise<void> {
    const tokenHash = hashToken(token);
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.consumedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(GENERIC_TOKEN_FAILURE);
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      action: "auth.email_verified",
      entityType: "user",
      entityId: record.userId,
      actorUserId: record.userId,
      requestId,
    });
  }

  async forgotPassword(emailRaw: string, requestId?: string): Promise<void> {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always succeed to avoid enumeration.
    if (!user) {
      return;
    }

    const rawToken = generateOpaqueToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + this.tokenTtlMs()),
      },
    });

    await this.email.send(
      buildPasswordResetEmail({
        to: user.email,
        appOrigin: this.appOrigin(),
        token: rawToken,
        ttlHours: this.tokenTtlHours(),
      }),
    );

    await this.audit.record({
      action: "auth.password_reset_requested",
      entityType: "user",
      entityId: user.id,
      actorUserId: user.id,
      requestId,
    });
  }

  async resetPassword(input: {
    token: string;
    password: string;
    requestId?: string;
  }): Promise<void> {
    const tokenHash = hashToken(input.token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.consumedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(GENERIC_TOKEN_FAILURE);
    }

    const passwordHash = await hashPassword(input.password);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
    ]);

    await this.sessions.revokeAllUserSessions(record.userId);

    await this.audit.record({
      action: "auth.password_reset",
      entityType: "user",
      entityId: record.userId,
      actorUserId: record.userId,
      requestId: input.requestId,
      metadata: { sessionsRevoked: true },
    });
  }
}
