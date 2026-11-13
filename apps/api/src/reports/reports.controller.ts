import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  createXrayReportBodySchema,
  reportWorkflowBodySchema,
  type CreateXrayReportBody,
  type ReportWorkflowBody,
} from "@opero/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { OrgMembershipGuard } from "../authorization/org-membership.guard";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import type { AuthenticatedUser } from "../types/express";
import { ReportsService } from "./reports.service";

/** Workflow actions accept an empty request body. */
const workflowBodyPipe = new ZodBodyPipe<ReportWorkflowBody>(
  z.preprocess((value) => value ?? {}, reportWorkflowBodySchema),
);

const createVersionBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    /** Omit to keep the current attachment; `null` removes it. */
    aiInterpretationVersionId: z.uuid().nullable().optional(),
  })
  .strict();

type CreateVersionBody = z.infer<typeof createVersionBodySchema>;

const createVersionBodyPipe = new ZodBodyPipe<CreateVersionBody>(
  z.preprocess((value) => value ?? {}, createVersionBodySchema),
);

@ApiTags("reports")
@Controller("organizations/:organizationId/reports")
@UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @RequirePermissions("xray:write")
  async create(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(createXrayReportBodySchema)) body: CreateXrayReportBody,
  ) {
    return this.reports.create({
      organizationId,
      actor: user,
      diagnosticRunId: body.diagnosticRunId,
      title: body.title,
      aiInterpretationVersionId: body.aiInterpretationVersionId,
      requestId: req.requestId,
    });
  }

  @Get()
  @RequirePermissions("xray:read")
  async list(@Param("organizationId") organizationId: string) {
    const reports = await this.reports.list(organizationId);
    return { reports };
  }

  @Get(":reportId")
  @RequirePermissions("xray:read")
  async get(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.getDetail(organizationId, reportId, {
      actor: user,
      requestId: req.requestId,
    });
  }

  @Get(":reportId/versions")
  @RequirePermissions("xray:read")
  async versions(
    @Param("organizationId") organizationId: string,
    @Param("reportId", ParseUUIDPipe) reportId: string,
  ) {
    const versions = await this.reports.listVersions(organizationId, reportId);
    return { versions };
  }

  @Post(":reportId/versions")
  @RequirePermissions("xray:write")
  async createVersion(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(createVersionBodyPipe) body: CreateVersionBody,
  ) {
    return this.reports.createVersion({
      organizationId,
      reportId,
      actor: user,
      title: body.title,
      aiInterpretationVersionId: body.aiInterpretationVersionId,
      requestId: req.requestId,
    });
  }

  @Get(":reportId/versions/:versionId")
  @RequirePermissions("xray:read")
  async version(
    @Param("organizationId") organizationId: string,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
  ) {
    return this.reports.getVersion(organizationId, reportId, versionId);
  }

  @Post(":reportId/versions/:versionId/render")
  @HttpCode(202)
  @RequirePermissions("xray:publish")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async render(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.requestRender({
      organizationId,
      reportId,
      versionId,
      actor: user,
      requestId: req.requestId,
    });
  }

  @Post(":reportId/submit-review")
  @HttpCode(200)
  @RequirePermissions("xray:write")
  async submitReview(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(workflowBodyPipe) body: ReportWorkflowBody,
  ) {
    return this.reports.submitForReview({
      organizationId,
      reportId,
      actor: user,
      note: body.note,
      requestId: req.requestId,
    });
  }

  @Post(":reportId/approve")
  @HttpCode(200)
  @RequirePermissions("xray:publish")
  async approve(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(workflowBodyPipe) body: ReportWorkflowBody,
  ) {
    return this.reports.approve({
      organizationId,
      reportId,
      actor: user,
      note: body.note,
      requestId: req.requestId,
    });
  }

  @Post(":reportId/reject")
  @HttpCode(200)
  @RequirePermissions("xray:publish")
  async reject(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(workflowBodyPipe) body: ReportWorkflowBody,
  ) {
    return this.reports.reject({
      organizationId,
      reportId,
      actor: user,
      note: body.note,
      requestId: req.requestId,
    });
  }

  @Post(":reportId/publish")
  @HttpCode(200)
  @RequirePermissions("xray:publish")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async publish(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(workflowBodyPipe) body: ReportWorkflowBody,
  ) {
    return this.reports.publish({
      organizationId,
      reportId,
      actor: user,
      note: body.note,
      requestId: req.requestId,
    });
  }

  /** Latest published PDF, or a specific published version with `?versionId=`. */
  @Get(":reportId/pdf")
  @RequirePermissions("xray:read")
  async pdf(
    @Req() req: Request,
    @Res() res: Response,
    @Param("organizationId") organizationId: string,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query("versionId", new ParseUUIDPipe({ optional: true })) versionId?: string,
  ) {
    const file = await this.reports.authorizeDownload({
      organizationId,
      reportId,
      versionId,
      actor: user,
      requestId: req.requestId,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(file.buffer);
  }
}
