import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { acceptPilotBootstrapInvitationBodySchema } from "@opero/shared";
import type { Request } from "express";
import { z } from "zod";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { PilotInvitationService } from "./pilot-invitation.service";

@Controller("auth/pilot-invitations")
export class PilotInvitationController {
  constructor(private readonly invitations: PilotInvitationService) {}

  @Post("accept")
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async accept(
    @Body(new ZodBodyPipe(acceptPilotBootstrapInvitationBodySchema))
    body: z.infer<typeof acceptPilotBootstrapInvitationBodySchema>,
    @Req() req: Request,
  ) {
    const result = await this.invitations.acceptInvitation({
      token: body.token,
      name: body.name,
      password: body.password,
      requestId: req.requestId,
    });
    return result;
  }
}
