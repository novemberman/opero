import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaClient } from "@opero/database";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/database.constants";

@Injectable()
export class OrgMembershipGuard implements CanActivate {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException("Authentication required");
    }

    const organizationId =
      (req.params.organizationId as string | undefined) ??
      (req.params.orgId as string | undefined);

    if (!organizationId) {
      throw new NotFoundException("Organization not found");
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: user.id,
        },
      },
    });

    if (!membership) {
      await this.audit.record({
        action: "authz.denied",
        entityType: "organization",
        entityId: organizationId,
        actorUserId: user.id,
        organizationId,
        requestId: req.requestId,
        metadata: { reason: "not_a_member" },
      });
      // Do not leak whether the organization exists.
      throw new NotFoundException("Organization not found");
    }

    req.membership = {
      id: membership.id,
      organizationId: membership.organizationId,
      userId: membership.userId,
      role: membership.role,
    };
    return true;
  }
}
