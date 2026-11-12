import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { roleHasEveryPermission, type Permission } from "@opero/shared";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { PERMISSIONS_KEY } from "./require-permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const membership = req.membership;
    if (!membership) {
      throw new ForbiddenException("Organization membership required");
    }

    if (!roleHasEveryPermission(membership.role, required)) {
      await this.audit.record({
        action: "authz.denied",
        entityType: "organization",
        entityId: membership.organizationId,
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        requestId: req.requestId,
        metadata: { reason: "missing_permission", required },
      });
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }
}
