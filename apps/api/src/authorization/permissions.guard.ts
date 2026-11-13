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
      const reportId =
        typeof req.params.reportId === "string" ? req.params.reportId : null;
      const path = req.route?.path ?? req.path ?? "";
      const publicationAction = /\/approve\b/.test(path)
        ? "approve"
        : /\/publish\b/.test(path)
          ? "publish"
          : /\/reject\b/.test(path)
            ? "reject"
            : /\/render\b/.test(path)
              ? "render"
              : null;
      await this.audit.record({
        action: publicationAction ? "report.publication_denied" : "authz.denied",
        entityType: publicationAction ? "xray_report" : "organization",
        entityId: publicationAction ? reportId : membership.organizationId,
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        requestId: req.requestId,
        metadata: {
          reason: "missing_permission",
          failureCode: "MISSING_PERMISSION",
          failureClass: "PERMISSION",
          required,
          ...(publicationAction ? { requestedAction: publicationAction } : {}),
          ...(reportId && !publicationAction ? { reportId } : {}),
        },
      });
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }
}
