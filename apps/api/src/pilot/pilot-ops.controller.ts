import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { createPilotBootstrapInvitationBodySchema } from "@opero/shared";
import type { Request } from "express";
import { z } from "zod";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { PilotInvitationService } from "./pilot-invitation.service";

@Controller("ops/pilot-invitations")
export class PilotOpsController {
  constructor(private readonly invitations: PilotInvitationService) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body(new ZodBodyPipe(createPilotBootstrapInvitationBodySchema))
    body: z.infer<typeof createPilotBootstrapInvitationBodySchema>,
    @Req() req: Request,
  ) {
    const invitation = await this.invitations.createInvitation({
      email: body.email,
      organizationName: body.organizationName,
      organizationSlug: body.organizationSlug,
      createdByLabel: body.createdByLabel,
      ttlHours: body.ttlHours,
      headers,
      requestId: req.requestId,
    });
    return { invitation };
  }

  @Post(":invitationId/revoke")
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async revoke(
    @Param("invitationId", ParseUUIDPipe) invitationId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: Request,
  ) {
    await this.invitations.revokeInvitation({
      invitationId,
      headers,
      requestId: req.requestId,
    });
  }
}
