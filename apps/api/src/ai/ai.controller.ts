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
import { Throttle } from "@nestjs/throttler";
import {
  createAiInterpretationBodySchema,
  editAiInterpretationBodySchema,
  type CreateAiInterpretationBody,
  type EditAiInterpretationBody,
} from "@opero/shared";
import type { Request } from "express";
import { z } from "zod";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { OrgMembershipGuard } from "../authorization/org-membership.guard";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import type { AuthenticatedUser } from "../types/express";
import { AiService } from "./ai.service";

const listQuerySchema = z.object({ diagnosticRunId: z.uuid().optional() }).strict();

@ApiTags("ai")
@Controller("organizations/:organizationId/ai")
@UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get("availability")
  @RequirePermissions("xray:read")
  availability() {
    return { availability: this.ai.availability() };
  }

  @Post("interpretations")
  @RequirePermissions("xray:write")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(createAiInterpretationBodySchema)) body: CreateAiInterpretationBody,
  ) {
    const run = await this.ai.createInterpretation({
      organizationId,
      actor: user,
      diagnosticRunId: body.diagnosticRunId,
      userNotes: body.userNotes,
      requestId: req.requestId,
    });
    return { run };
  }

  @Get("interpretations")
  @RequirePermissions("xray:read")
  async list(
    @Param("organizationId") organizationId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException("Invalid interpretation filter");
    }
    const runs = await this.ai.listRuns(organizationId, parsed.data.diagnosticRunId);
    return { runs };
  }

  @Get("interpretations/:runId")
  @RequirePermissions("xray:read")
  async get(
    @Param("organizationId") organizationId: string,
    @Param("runId", ParseUUIDPipe) runId: string,
  ) {
    const run = await this.ai.getRun(organizationId, runId);
    return { run };
  }

  @Post("interpretations/:runId/versions/:versionId/edit")
  @HttpCode(200)
  @RequirePermissions("xray:write")
  async edit(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("runId", ParseUUIDPipe) runId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(editAiInterpretationBodySchema)) body: EditAiInterpretationBody,
  ) {
    const version = await this.ai.editVersion({
      organizationId,
      runId,
      versionId,
      actor: user,
      edits: body,
      requestId: req.requestId,
    });
    return { version };
  }
}
