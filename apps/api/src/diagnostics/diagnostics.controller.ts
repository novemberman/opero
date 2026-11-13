import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createDiagnosticRunBodySchema } from "@opero/shared";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { OrgMembershipGuard } from "../authorization/org-membership.guard";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import type { AuthenticatedUser } from "../types/express";
import { DiagnosticsService } from "./diagnostics.service";

@ApiTags("diagnostics")
@Controller("organizations/:organizationId/diagnostics")
@UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
export class DiagnosticsController {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  @Post()
  @RequirePermissions("xray:write")
  async create(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(createDiagnosticRunBodySchema)) body: unknown,
  ) {
    const input = body as {
      documentIds: string[];
      currency?: string;
      periodLabel?: string;
    };
    const run = await this.diagnostics.createRun({
      organizationId,
      actor: user,
      documentIds: input.documentIds,
      currency: input.currency,
      periodLabel: input.periodLabel,
      requestId: req.requestId,
    });
    return { run };
  }

  @Get()
  @RequirePermissions("xray:read")
  async list(@Param("organizationId") organizationId: string) {
    const runs = await this.diagnostics.listRuns(organizationId);
    return { runs };
  }

  @Get(":runId")
  @RequirePermissions("xray:read")
  async get(
    @Param("organizationId") organizationId: string,
    @Param("runId") runId: string,
  ) {
    const run = await this.diagnostics.getRun(organizationId, runId);
    return { run };
  }

  @Get(":runId/metrics")
  @RequirePermissions("xray:read")
  async metrics(
    @Param("organizationId") organizationId: string,
    @Param("runId") runId: string,
  ) {
    const metrics = await this.diagnostics.getMetrics(organizationId, runId);
    return { metrics };
  }

  @Get(":runId/quality")
  @RequirePermissions("xray:read")
  async quality(
    @Param("organizationId") organizationId: string,
    @Param("runId") runId: string,
  ) {
    const quality = await this.diagnostics.getQuality(organizationId, runId);
    return { quality };
  }

  @Get(":runId/score")
  @RequirePermissions("xray:read")
  async score(
    @Param("organizationId") organizationId: string,
    @Param("runId") runId: string,
  ) {
    const score = await this.diagnostics.getScore(organizationId, runId);
    return { score };
  }

  @Get(":runId/findings")
  @RequirePermissions("xray:read")
  async findings(
    @Param("organizationId") organizationId: string,
    @Param("runId") runId: string,
  ) {
    const findings = await this.diagnostics.getFindings(organizationId, runId);
    return { findings };
  }
}
