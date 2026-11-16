import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PrismaClient } from "@opero/database";
import { AuditService } from "../audit/audit.service";
import { EmailPort } from "../auth/email/email.port";
import type { ApiEnv } from "../config/env";
import { PRISMA_CLIENT } from "../database/database.constants";
import { hashPassword } from "../security/passwords";
import { timingSafeStringEqual } from "../security/timing-safe-equal";
import { generateOpaqueToken, hashToken } from "../security/tokens";

const PILOT_USER_CAP_LOCK = 7_201_611_401;
const PILOT_ORG_CAP_LOCK = 7_201_611_402;

@Injectable()
export class PilotInvitationService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly config: ConfigService<ApiEnv, true>,
    private readonly audit: AuditService,
    private readonly email: EmailPort,
  ) {}

  private assertOpsToken(headers: Record<string, string | string[] | undefined>): void {
    const expected = this.config.get("OPS_STATUS_TOKEN", { infer: true });
    if (!expected) {
      throw new ServiceUnavailableException({
        message: "OPS_STATUS_TOKEN must be configured to issue pilot invitations",
        code: "OPS_TOKEN_NOT_CONFIGURED",
      });
    }
    const rawHeader = headers["x-ops-token"];
    const headerToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const auth = headers.authorization;
    const authValue = Array.isArray(auth) ? auth[0] : auth;
    const bearer =
      typeof authValue === "string" && authValue.toLowerCase().startsWith("bearer ")
        ? authValue.slice(7).trim()
        : undefined;
    const provided = (headerToken?.trim() || bearer || "").trim();
    if (!provided || !timingSafeStringEqual(provided, expected)) {
      throw new UnauthorizedException({
        message: "Ops status token required",
        code: "OPS_STATUS_UNAUTHORIZED",
      });
    }
  }

  async createInvitation(input: {
    email: string;
    organizationName: string;
    organizationSlug: string;
    createdByLabel: string;
    ttlHours?: number;
    headers: Record<string, string | string[] | undefined>;
    requestId?: string;
  }) {
    this.assertOpsToken(input.headers);

    const email = input.email.trim().toLowerCase();
    const slug = input.organizationSlug.trim().toLowerCase();
    const ttlHours =
      input.ttlHours ?? this.config.get("PILOT_BOOTSTRAP_INVITE_TTL_HOURS", { infer: true });

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException({
        message: "A user with this email already exists",
        code: "PILOT_INVITE_EMAIL_EXISTS",
      });
    }
    const existingSlug = await this.prisma.organization.findUnique({ where: { slug } });
    if (existingSlug) {
      throw new ConflictException({
        message: "Organization slug is already taken",
        code: "PILOT_INVITE_SLUG_EXISTS",
      });
    }

    const rawToken = generateOpaqueToken();
    const invitation = await this.prisma.pilotBootstrapInvitation.create({
      data: {
        email,
        organizationName: input.organizationName.trim(),
        organizationSlug: slug,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
        createdByLabel: input.createdByLabel.trim(),
      },
    });

    const acceptUrl = `${this.config.get("APP_ORIGIN", { infer: true })}/pilot/accept?token=${rawToken}`;
    await this.email.send({
      to: email,
      subject: "Your Opero pilot invitation",
      text: `You have been invited to join Opero as the owner of "${input.organizationName.trim()}". Accept: ${acceptUrl}`,
    });

    await this.audit.record({
      action: "pilot.invite_created",
      entityType: "pilot_bootstrap_invitation",
      entityId: invitation.id,
      requestId: input.requestId,
      metadata: {
        email,
        organizationSlug: slug,
        createdByLabel: input.createdByLabel.trim(),
        expiresAt: invitation.expiresAt.toISOString(),
      },
    });

    // Return raw token only once to the authorized ops caller (never logged).
    return {
      id: invitation.id,
      email,
      organizationName: invitation.organizationName,
      organizationSlug: invitation.organizationSlug,
      expiresAt: invitation.expiresAt,
      token: rawToken,
    };
  }

  async revokeInvitation(input: {
    invitationId: string;
    headers: Record<string, string | string[] | undefined>;
    requestId?: string;
  }) {
    this.assertOpsToken(input.headers);
    const invitation = await this.prisma.pilotBootstrapInvitation.findUnique({
      where: { id: input.invitationId },
    });
    if (!invitation || invitation.revokedAt || invitation.consumedAt) {
      throw new NotFoundException("Pilot invitation not found");
    }
    await this.prisma.pilotBootstrapInvitation.update({
      where: { id: invitation.id },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      action: "pilot.invite_revoked",
      entityType: "pilot_bootstrap_invitation",
      entityId: invitation.id,
      requestId: input.requestId,
      metadata: { email: invitation.email },
    });
  }

  async acceptInvitation(input: {
    token: string;
    name: string;
    password: string;
    requestId?: string;
  }) {
    // Public registration remains disabled — this path is invite-token only.
    if (this.config.get("PUBLIC_REGISTRATION_ENABLED", { infer: true })) {
      // Still allowed when public reg is on, but PILOT_MODE production forbids that combo.
    }

    const tokenHash = hashToken(input.token);
    const invitation = await this.prisma.pilotBootstrapInvitation.findUnique({
      where: { tokenHash },
    });
    if (
      !invitation ||
      invitation.revokedAt ||
      invitation.consumedAt ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException({
        message: "Invalid or expired pilot invitation",
        code: "PILOT_INVITE_INVALID",
      });
    }

    const passwordHash = await hashPassword(input.password);
    const maxUsers = this.config.get("PILOT_MAX_USERS", { infer: true });
    const maxOrgs = this.config.get("PILOT_MAX_ORGANIZATIONS", { infer: true });

    const result = await this.prisma.$transaction(async (tx) => {
      // Re-load under transaction for single-use CAS.
      const locked = await tx.pilotBootstrapInvitation.findUnique({ where: { tokenHash } });
      if (
        !locked ||
        locked.revokedAt ||
        locked.consumedAt ||
        locked.expiresAt.getTime() <= Date.now()
      ) {
        throw new BadRequestException({
          message: "Invalid or expired pilot invitation",
          code: "PILOT_INVITE_INVALID",
        });
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PILOT_USER_CAP_LOCK})`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PILOT_ORG_CAP_LOCK})`;

      if (maxUsers != null) {
        const userCount = await tx.user.count();
        if (userCount >= maxUsers) {
          throw new ForbiddenException({
            message: "Pilot user limit reached. Contact the operator for access.",
            code: "PILOT_USER_LIMIT",
          });
        }
      }
      if (maxOrgs != null) {
        const orgCount = await tx.organization.count();
        if (orgCount >= maxOrgs) {
          throw new ForbiddenException({
            message: "Pilot organization limit reached. Contact the operator for access.",
            code: "PILOT_ORG_LIMIT",
          });
        }
      }

      const existingUser = await tx.user.findUnique({ where: { email: locked.email } });
      if (existingUser) {
        throw new ConflictException({
          message: "A user with this email already exists",
          code: "PILOT_INVITE_EMAIL_EXISTS",
        });
      }
      const existingSlug = await tx.organization.findUnique({
        where: { slug: locked.organizationSlug },
      });
      if (existingSlug) {
        throw new ConflictException({
          message: "Organization slug is already taken",
          code: "PILOT_INVITE_SLUG_EXISTS",
        });
      }

      const user = await tx.user.create({
        data: {
          email: locked.email,
          name: input.name.trim(),
          passwordHash,
          // Invitation was issued to this email by ops — same model as org invitations.
          emailVerifiedAt: new Date(),
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: locked.organizationName,
          slug: locked.organizationSlug,
        },
      });

      await tx.membership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: "OWNER",
        },
      });

      const consumed = await tx.pilotBootstrapInvitation.updateMany({
        where: { id: locked.id, consumedAt: null, revokedAt: null },
        data: {
          consumedAt: new Date(),
          consumedUserId: user.id,
          consumedOrganizationId: organization.id,
        },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException({
          message: "Invalid or expired pilot invitation",
          code: "PILOT_INVITE_INVALID",
        });
      }

      return { user, organization };
    });

    await this.audit.record({
      action: "pilot.invite_accepted",
      entityType: "pilot_bootstrap_invitation",
      entityId: invitation.id,
      organizationId: result.organization.id,
      actorUserId: result.user.id,
      requestId: input.requestId,
      metadata: {
        email: result.user.email,
        organizationSlug: result.organization.slug,
      },
    });
    await this.audit.record({
      action: "org.created",
      entityType: "organization",
      entityId: result.organization.id,
      organizationId: result.organization.id,
      actorUserId: result.user.id,
      requestId: input.requestId,
      metadata: { via: "pilot_bootstrap_invitation" },
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
      },
    };
  }
}
