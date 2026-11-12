import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type MembershipRole, type PrismaClient } from "@opero/database";
import { AuditService } from "../audit/audit.service";
import { EmailPort } from "../auth/email/email.port";
import type { ApiEnv } from "../config/env";
import { PRISMA_CLIENT } from "../database/database.constants";
import { hashPassword } from "../security/passwords";
import { generateOpaqueToken, hashToken } from "../security/tokens";
import type { AuthenticatedUser } from "../types/express";

/** Lock all OWNER rows for an org so concurrent demote/remove cannot drop the last owner. */
async function lockOrganizationOwners(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM memberships
    WHERE organization_id = ${organizationId}::uuid AND role = 'OWNER'
    FOR UPDATE
  `;
}


@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly email: EmailPort,
    private readonly config: ConfigService<ApiEnv, true>,
  ) {}

  private inviteTtlMs(): number {
    return this.config.get("AUTH_TOKEN_TTL_HOURS", { infer: true }) * 60 * 60 * 1000;
  }

  async create(
    user: AuthenticatedUser,
    input: { name: string; slug: string },
    requestId?: string,
  ) {
    const slug = input.slug.trim().toLowerCase();
    const existing = await this.prisma.organization.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException("Organization slug is already taken");
    }

    const organization = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: input.name.trim(), slug },
      });
      await tx.membership.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: "OWNER",
        },
      });
      return org;
    });

    await this.audit.record({
      action: "org.created",
      entityType: "organization",
      entityId: organization.id,
      organizationId: organization.id,
      actorUserId: user.id,
      requestId,
    });

    return organization;
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((m) => ({
      role: m.role,
      organization: m.organization,
    }));
  }

  async getForMember(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException("Organization not found");
    }
    return organization;
  }

  async update(
    organizationId: string,
    actorUserId: string,
    name: string,
    requestId?: string,
  ) {
    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { name: name.trim() },
    });
    await this.audit.record({
      action: "org.updated",
      entityType: "organization",
      entityId: organizationId,
      organizationId,
      actorUserId,
      requestId,
      metadata: { name: organization.name },
    });
    return organization;
  }

  async listMembers(organizationId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId },
      include: {
        user: { select: { id: true, email: true, name: true, emailVerifiedAt: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async invite(input: {
    organizationId: string;
    email: string;
    role: Exclude<MembershipRole, "OWNER">;
    actor: AuthenticatedUser;
    requestId?: string;
  }) {
    const email = input.email.trim().toLowerCase();
    if (input.role === ("OWNER" as never)) {
      throw new BadRequestException("Cannot invite as OWNER");
    }

    const existingMember = await this.prisma.membership.findFirst({
      where: {
        organizationId: input.organizationId,
        user: { email },
      },
    });
    if (existingMember) {
      throw new ConflictException("User is already a member");
    }

    const rawToken = generateOpaqueToken();
    const invitation = await this.prisma.organizationInvitation.create({
      data: {
        organizationId: input.organizationId,
        email,
        role: input.role,
        tokenHash: hashToken(rawToken),
        invitedByUserId: input.actor.id,
        expiresAt: new Date(Date.now() + this.inviteTtlMs()),
      },
    });

    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: input.organizationId },
    });

    await this.email.send({
      to: email,
      subject: `Invitation to join ${org.name} on Opero`,
      text: `You were invited to join ${org.name} as ${input.role}. Accept: ${this.config.get("APP_ORIGIN", { infer: true })}/invitations/accept?token=${rawToken}`,
    });

    await this.audit.record({
      action: "org.invite_created",
      entityType: "organization_invitation",
      entityId: invitation.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: { email, role: input.role },
    });

    return { id: invitation.id, email, role: invitation.role, expiresAt: invitation.expiresAt };
  }

  async revokeInvitation(input: {
    organizationId: string;
    invitationId: string;
    actorUserId: string;
    requestId?: string;
  }) {
    const invitation = await this.prisma.organizationInvitation.findFirst({
      where: { id: input.invitationId, organizationId: input.organizationId },
    });
    if (!invitation || invitation.revokedAt || invitation.consumedAt) {
      throw new NotFoundException("Invitation not found");
    }
    await this.prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      action: "org.invite_revoked",
      entityType: "organization_invitation",
      entityId: invitation.id,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      requestId: input.requestId,
    });
  }

  async listInvitations(organizationId: string) {
    return this.prisma.organizationInvitation.findMany({
      where: {
        organizationId,
        revokedAt: null,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async acceptInvitation(input: {
    token: string;
    actor?: AuthenticatedUser;
    name?: string;
    password?: string;
    requestId?: string;
  }) {
    const tokenHash = hashToken(input.token);
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { tokenHash },
    });
    if (
      !invitation ||
      invitation.revokedAt ||
      invitation.consumedAt ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException("Invalid or expired invitation");
    }

    let user = input.actor
      ? await this.prisma.user.findUnique({ where: { id: input.actor.id } })
      : await this.prisma.user.findUnique({ where: { email: invitation.email } });

    if (input.actor && input.actor.email.toLowerCase() !== invitation.email) {
      throw new ForbiddenException("Invitation email does not match the signed-in user");
    }

    if (!user) {
      if (!input.name || !input.password) {
        throw new BadRequestException("Name and password are required to accept this invitation");
      }
      user = await this.prisma.user.create({
        data: {
          email: invitation.email,
          name: input.name.trim(),
          passwordHash: await hashPassword(input.password),
          emailVerifiedAt: new Date(),
        },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: user!.id,
          },
        },
      });
      if (!existing) {
        await tx.membership.create({
          data: {
            organizationId: invitation.organizationId,
            userId: user!.id,
            role: invitation.role,
          },
        });
      }
      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { consumedAt: new Date() },
      });
    });

    await this.audit.record({
      action: "org.invite_accepted",
      entityType: "organization_invitation",
      entityId: invitation.id,
      organizationId: invitation.organizationId,
      actorUserId: user.id,
      requestId: input.requestId,
    });

    return { organizationId: invitation.organizationId, userId: user.id };
  }

  async declineInvitation(input: {
    token: string;
    actor: AuthenticatedUser;
    requestId?: string;
  }) {
    const tokenHash = hashToken(input.token);
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { tokenHash },
    });
    if (
      !invitation ||
      invitation.revokedAt ||
      invitation.consumedAt ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException("Invalid or expired invitation");
    }
    if (invitation.email !== input.actor.email.toLowerCase()) {
      throw new ForbiddenException("Invitation email does not match the signed-in user");
    }
    await this.prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      action: "org.invite_declined",
      entityType: "organization_invitation",
      entityId: invitation.id,
      organizationId: invitation.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
    });
  }

  async changeRole(input: {
    organizationId: string;
    memberUserId: string;
    role: MembershipRole;
    actorUserId: string;
    actorRole: MembershipRole;
    requestId?: string;
  }) {
    // Only OWNER may assign OWNER. ADMIN cannot escalate privileges.
    if (input.role === "OWNER" && input.actorRole !== "OWNER") {
      throw new ForbiddenException("Only an owner can assign the owner role");
    }

    await this.prisma.$transaction(
      async (tx) => {
        await lockOrganizationOwners(tx, input.organizationId);

        const membership = await tx.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: input.organizationId,
              userId: input.memberUserId,
            },
          },
        });
        if (!membership) {
          throw new NotFoundException("Member not found");
        }

        if (membership.role === "OWNER" && input.role !== "OWNER") {
          const owners = await tx.membership.count({
            where: { organizationId: input.organizationId, role: "OWNER" },
          });
          if (owners <= 1) {
            throw new ForbiddenException("Cannot demote the final owner");
          }
        }

        await tx.membership.update({
          where: { id: membership.id },
          data: { role: input.role },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.record({
      action: "org.member_role_changed",
      entityType: "membership",
      entityId: input.memberUserId,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      requestId: input.requestId,
      metadata: { role: input.role },
    });
  }

  async removeMember(input: {
    organizationId: string;
    memberUserId: string;
    actorUserId: string;
    requestId?: string;
  }) {
    await this.prisma.$transaction(
      async (tx) => {
        await lockOrganizationOwners(tx, input.organizationId);

        const membership = await tx.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: input.organizationId,
              userId: input.memberUserId,
            },
          },
        });
        if (!membership) {
          throw new NotFoundException("Member not found");
        }
        if (membership.role === "OWNER") {
          const owners = await tx.membership.count({
            where: { organizationId: input.organizationId, role: "OWNER" },
          });
          if (owners <= 1) {
            throw new ForbiddenException("Cannot remove the final owner");
          }
        }
        await tx.membership.delete({ where: { id: membership.id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.record({
      action: "org.member_removed",
      entityType: "membership",
      entityId: input.memberUserId,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      requestId: input.requestId,
    });
  }

  async leave(input: {
    organizationId: string;
    userId: string;
    requestId?: string;
  }) {
    await this.prisma.$transaction(
      async (tx) => {
        await lockOrganizationOwners(tx, input.organizationId);

        const membership = await tx.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: input.organizationId,
              userId: input.userId,
            },
          },
        });
        if (!membership) {
          throw new NotFoundException("Membership not found");
        }
        if (membership.role === "OWNER") {
          const owners = await tx.membership.count({
            where: { organizationId: input.organizationId, role: "OWNER" },
          });
          if (owners <= 1) {
            throw new ForbiddenException("Final owner cannot leave the organization");
          }
        }
        await tx.membership.delete({ where: { id: membership.id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.record({
      action: "org.member_left",
      entityType: "membership",
      entityId: input.userId,
      organizationId: input.organizationId,
      actorUserId: input.userId,
      requestId: input.requestId,
    });
  }
}
