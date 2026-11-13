import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@opero/database";
import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/database.constants";
import type { AuthenticatedUser } from "../types/express";
import { CatalogService } from "./catalog.service";
import { EntitlementsService } from "./entitlements.service";

@Injectable()
export class BillingService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly catalog: CatalogService,
    private readonly entitlementsService: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  publicCatalog() {
    return this.catalog.publicCatalog();
  }

  async purchaseHistory(organizationId: string) {
    return this.prisma.purchase.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reportId: true,
        productCode: true,
        amountMinor: true,
        currency: true,
        status: true,
        fulfilledAt: true,
        refundedAt: true,
        createdAt: true,
        payment: { select: { reference: true, status: true, provider: true } },
      },
    });
  }

  async paymentHistory(organizationId: string) {
    return this.prisma.payment.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reference: true,
        status: true,
        amountMinor: true,
        currency: true,
        provider: true,
        paidAt: true,
        failedAt: true,
        refundedAt: true,
        fulfilledAt: true,
        createdAt: true,
        checkoutIntent: {
          select: { purpose: true, productCode: true, reportId: true, planId: true },
        },
      },
    });
  }

  async listEntitlements(organizationId: string) {
    return this.entitlementsService.listActive(organizationId);
  }

  async requestEnterpriseQuote(input: {
    organizationId?: string | null;
    actor?: AuthenticatedUser | null;
    contactName: string;
    contactEmail: string;
    companyName: string;
    message: string;
    requestId?: string;
  }) {
    const row = await this.prisma.enterpriseQuoteRequest.create({
      data: {
        organizationId: input.organizationId ?? null,
        actorUserId: input.actor?.id ?? null,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        companyName: input.companyName,
        message: input.message.slice(0, 4000),
        status: "RECEIVED",
      },
    });
    await this.audit.record({
      action: "billing.enterprise_quote_requested",
      entityType: "enterprise_quote_request",
      entityId: row.id,
      organizationId: input.organizationId,
      actorUserId: input.actor?.id,
      requestId: input.requestId,
      metadata: { companyName: input.companyName },
    });
    return row;
  }
}
