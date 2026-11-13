import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { z } from "zod";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { OrgMembershipGuard } from "../authorization/org-membership.guard";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import type { AuthenticatedUser } from "../types/express";
import { BillingService } from "./billing.service";
import { CheckoutService } from "./checkout.service";
import { SubscriptionsService } from "./subscriptions.service";

const xrayCheckoutSchema = z
  .object({
    reportId: z.uuid(),
    idempotencyKey: z.string().trim().min(8).max(120),
    redirectUrl: z.url().max(500).optional(),
  })
  .strict();

const subscriptionCheckoutSchema = z
  .object({
    planCode: z.enum(["OS_STARTER", "OS_GROWTH"]),
    purpose: z.enum(["SUBSCRIPTION_START", "SUBSCRIPTION_RENEW"]).default("SUBSCRIPTION_START"),
    subscriptionId: z.uuid().optional(),
    idempotencyKey: z.string().trim().min(8).max(120),
    redirectUrl: z.url().max(500).optional(),
  })
  .strict();

const verifySchema = z
  .object({
    reference: z.string().trim().min(8).max(120),
  })
  .strict();

const enterpriseSchema = z
  .object({
    contactName: z.string().trim().min(1).max(120),
    contactEmail: z.email().max(320),
    companyName: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(4000),
  })
  .strict();

@Controller()
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly checkout: CheckoutService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Get("billing/catalog")
  async publicCatalog() {
    return this.billing.publicCatalog();
  }

  @Post("billing/enterprise-quotes")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async enterpriseQuote(
    @Body(new ZodBodyPipe(enterpriseSchema)) body: z.infer<typeof enterpriseSchema>,
    @Req() req: Request,
  ) {
    const quote = await this.billing.requestEnterpriseQuote({
      ...body,
      requestId: req.requestId,
    });
    return { quote: { id: quote.id, status: quote.status } };
  }

  @Get("organizations/:organizationId/billing/catalog")
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("billing:read")
  async orgCatalog() {
    return this.billing.publicCatalog();
  }

  @Get("organizations/:organizationId/billing/purchases")
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("billing:read")
  async purchases(@Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return { purchases: await this.billing.purchaseHistory(organizationId) };
  }

  @Get("organizations/:organizationId/billing/payments")
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("billing:read")
  async payments(@Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return { payments: await this.billing.paymentHistory(organizationId) };
  }

  @Get("organizations/:organizationId/billing/entitlements")
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("billing:read")
  async entitlements(@Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return { entitlements: await this.billing.listEntitlements(organizationId) };
  }

  @Get("organizations/:organizationId/billing/subscriptions")
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("billing:read")
  async listSubscriptions(@Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return { subscriptions: await this.subscriptions.list(organizationId) };
  }

  @Post("organizations/:organizationId/billing/checkout/xray-pro")
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("billing:manage")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async checkoutXrayPro(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodBodyPipe(xrayCheckoutSchema)) body: z.infer<typeof xrayCheckoutSchema>,
    @Req() req: Request,
  ) {
    return this.checkout.startXrayProCheckout({
      organizationId,
      actor,
      reportId: body.reportId,
      idempotencyKey: body.idempotencyKey,
      redirectUrl: body.redirectUrl,
      requestId: req.requestId,
    });
  }

  @Post("organizations/:organizationId/billing/checkout/subscription")
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("billing:manage")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async checkoutSubscription(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodBodyPipe(subscriptionCheckoutSchema))
    body: z.infer<typeof subscriptionCheckoutSchema>,
    @Req() req: Request,
  ) {
    return this.checkout.startSubscriptionCheckout({
      organizationId,
      actor,
      planCode: body.planCode,
      purpose: body.purpose,
      subscriptionId: body.subscriptionId,
      idempotencyKey: body.idempotencyKey,
      redirectUrl: body.redirectUrl,
      requestId: req.requestId,
    });
  }

  @Post("organizations/:organizationId/billing/payments/verify")
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("billing:manage")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async verifyPayment(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodBodyPipe(verifySchema)) body: z.infer<typeof verifySchema>,
    @Req() req: Request,
  ) {
    return this.checkout.verifyAndFulfill({
      organizationId,
      reference: body.reference,
      actor,
      requestId: req.requestId,
    });
  }

  @Get("organizations/:organizationId/billing/checkouts/:checkoutId")
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("billing:read")
  async getCheckout(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("checkoutId", ParseUUIDPipe) checkoutId: string,
  ) {
    return this.checkout.getCheckout(organizationId, checkoutId);
  }

  @Post("organizations/:organizationId/billing/subscriptions/:subscriptionId/cancel")
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("billing:manage")
  async cancelSubscription(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("subscriptionId", ParseUUIDPipe) subscriptionId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const subscription = await this.subscriptions.cancelAtPeriodEnd({
      organizationId,
      subscriptionId,
      actor,
      requestId: req.requestId,
    });
    return { subscription };
  }

  @Get("organizations/:organizationId/billing/subscriptions/renewals-due")
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("billing:read")
  async renewalsDue(@Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return {
      renewals: await this.subscriptions.listDueForRenewalReminder(organizationId),
      autoDebit: false,
      note: "Renewals require an explicitly authorized SUBSCRIPTION_RENEW checkout. No automatic debit.",
    };
  }

  @Post("organizations/:organizationId/billing/subscriptions/:subscriptionId/remind")
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("billing:manage")
  async remindRenewal(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("subscriptionId", ParseUUIDPipe) subscriptionId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.subscriptions.recordRenewalReminder({
      organizationId,
      subscriptionId,
      actor,
      requestId: req.requestId,
    });
  }
}
