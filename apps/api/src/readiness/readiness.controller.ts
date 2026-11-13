import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { assessReadinessBodySchema, type AssessReadinessBody } from "@opero/shared";
import type { Request } from "express";
import { z } from "zod";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { OrgMembershipGuard } from "../authorization/org-membership.guard";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import type { AuthenticatedUser } from "../types/express";
import { ReadinessService } from "./readiness.service";

const latestReadinessQuerySchema = z
  .object({
    diagnosticRunId: z.uuid().optional(),
    /** Comma-separated document ids. */
    documentIds: z
      .string()
      .transform((value) => value.split(",").map((id) => id.trim()))
      .pipe(z.array(z.uuid()).min(1).max(20))
      .optional(),
  })
  .strict();

@ApiTags("readiness")
@Controller("organizations/:organizationId/readiness")
@UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService) {}

  /** Persists an assessment (and any newly detected evidence conflicts). */
  @Post("assess")
  @RequirePermissions("xray:write")
  async assess(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(assessReadinessBodySchema)) body: AssessReadinessBody,
  ) {
    const { assessment } = await this.readiness.assess({
      organizationId,
      actor: user,
      documentIds: body.documentIds,
      diagnosticRunId: body.diagnosticRunId,
      requestId: req.requestId,
    });
    return { assessment };
  }

  @Get("latest")
  @RequirePermissions("xray:read")
  async latest(
    @Param("organizationId") organizationId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const parsed = latestReadinessQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException("Invalid readiness filter");
    }
    const assessment = await this.readiness.latest(organizationId, parsed.data);
    return { assessment };
  }
}
