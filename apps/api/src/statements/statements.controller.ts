import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  updateStatementMetadataBodySchema,
  type UpdateStatementMetadataBody,
} from "@opero/shared";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { OrgMembershipGuard } from "../authorization/org-membership.guard";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import type { AuthenticatedUser } from "../types/express";
import { StatementsService } from "./statements.service";

@ApiTags("statements")
@Controller("organizations/:organizationId/statements")
@UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
export class StatementsController {
  constructor(private readonly statements: StatementsService) {}

  @Get(":statementId/metadata")
  @RequirePermissions("xray:read")
  async getMetadata(
    @Param("organizationId") organizationId: string,
    @Param("statementId", ParseUUIDPipe) statementId: string,
  ) {
    return this.statements.getMetadata(organizationId, statementId);
  }

  @Patch(":statementId/metadata")
  @RequirePermissions("xray:write")
  async updateMetadata(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("statementId", ParseUUIDPipe) statementId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(updateStatementMetadataBodySchema)) body: UpdateStatementMetadataBody,
  ) {
    return this.statements.updateMetadata({
      organizationId,
      statementId,
      actor: user,
      body,
      requestId: req.requestId,
    });
  }
}
