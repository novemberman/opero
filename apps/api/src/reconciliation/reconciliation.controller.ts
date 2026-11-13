import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { resolveReconciliationBodySchema, type ResolveReconciliationBody } from "@opero/shared";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { OrgMembershipGuard } from "../authorization/org-membership.guard";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import type { AuthenticatedUser } from "../types/express";
import {
  detectReconciliationsBodySchema,
  listReconciliationsQuerySchema,
  type DetectReconciliationsBody,
} from "./reconciliation.schemas";
import { ReconciliationService } from "./reconciliation.service";

@ApiTags("reconciliations")
@Controller("organizations/:organizationId/reconciliations")
@UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get()
  @RequirePermissions("xray:read")
  async list(
    @Param("organizationId") organizationId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const parsed = listReconciliationsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException("Invalid reconciliation filter");
    }
    const reconciliations = await this.reconciliation.list(organizationId, parsed.data);
    return { reconciliations };
  }

  @Post("detect")
  @HttpCode(200)
  @RequirePermissions("xray:write")
  async detect(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(detectReconciliationsBodySchema)) body: DetectReconciliationsBody,
  ) {
    return this.reconciliation.detect({
      organizationId,
      actor: user,
      scope: body.diagnosticRunId
        ? { diagnosticRunId: body.diagnosticRunId }
        : { documentIds: body.documentIds ?? [] },
      requestId: req.requestId,
    });
  }

  @Get(":reconciliationId")
  @RequirePermissions("xray:read")
  async get(
    @Param("organizationId") organizationId: string,
    @Param("reconciliationId", ParseUUIDPipe) reconciliationId: string,
  ) {
    const reconciliation = await this.reconciliation.get(organizationId, reconciliationId);
    return { reconciliation };
  }

  @Post(":reconciliationId/resolve")
  @HttpCode(200)
  @RequirePermissions("xray:write")
  async resolve(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("reconciliationId", ParseUUIDPipe) reconciliationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(resolveReconciliationBodySchema)) body: ResolveReconciliationBody,
  ) {
    const reconciliation = await this.reconciliation.resolve({
      organizationId,
      reconciliationId,
      actor: user,
      resolution: body.resolution,
      selectedLineItemId: body.selectedLineItemId,
      correctedValue: body.correctedValue,
      reason: body.reason,
      requestId: req.requestId,
    });
    return { reconciliation };
  }
}
