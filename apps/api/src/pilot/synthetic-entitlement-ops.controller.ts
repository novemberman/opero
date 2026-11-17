import { Body, Controller, Headers, HttpCode, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  issueSyntheticEntitlementBodySchema,
  revokeSyntheticEntitlementBodySchema,
} from "@opero/shared";
import type { Request } from "express";
import { z } from "zod";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { SyntheticEntitlementService } from "./synthetic-entitlement.service";

@Controller("ops/synthetic-entitlements")
export class SyntheticEntitlementOpsController {
  constructor(private readonly synthetic: SyntheticEntitlementService) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async issue(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body(new ZodBodyPipe(issueSyntheticEntitlementBodySchema))
    body: z.infer<typeof issueSyntheticEntitlementBodySchema>,
    @Req() req: Request,
  ) {
    const result = await this.synthetic.issue({
      organizationId: body.organizationId,
      reportId: body.reportId,
      code: body.code,
      acceptanceReference: body.acceptanceReference,
      reason: body.reason,
      createdByLabel: body.createdByLabel,
      ttlHours: body.ttlHours,
      headers,
      requestId: req.requestId,
    });
    return result;
  }

  @Post("revoke")
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async revoke(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body(new ZodBodyPipe(revokeSyntheticEntitlementBodySchema))
    body: z.infer<typeof revokeSyntheticEntitlementBodySchema>,
    @Req() req: Request,
  ) {
    const result = await this.synthetic.revoke({
      organizationId: body.organizationId,
      reportId: body.reportId,
      code: body.code,
      reason: body.reason,
      createdByLabel: body.createdByLabel,
      headers,
      requestId: req.requestId,
    });
    return result;
  }
}
