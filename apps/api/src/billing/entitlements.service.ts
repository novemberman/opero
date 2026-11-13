import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@opero/database";
import type { EntitlementCode } from "@opero/shared";
import { FREE_TIER_ENTITLEMENTS } from "@opero/shared";
import { PRISMA_CLIENT } from "../database/database.constants";

@Injectable()
export class EntitlementsService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  /**
   * True when the organization holds an active grant for `code`.
   * Report-scoped codes also accept an org-wide grant (e.g. OS subscription).
   */
  async hasEntitlement(input: {
    organizationId: string;
    code: EntitlementCode;
    reportId?: string | null;
    at?: Date;
  }): Promise<boolean> {
    const at = input.at ?? new Date();
    if ((FREE_TIER_ENTITLEMENTS as readonly string[]).includes(input.code)) {
      return true;
    }

    const grants = await this.prisma.entitlementGrant.findMany({
      where: {
        organizationId: input.organizationId,
        code: input.code,
        revokedAt: null,
        validFrom: { lte: at },
        OR: [{ validUntil: null }, { validUntil: { gt: at } }],
      },
      select: { scopeType: true, scopeId: true },
    });

    return grants.some((grant) => {
      if (grant.scopeType === "ORGANIZATION") return true;
      if (grant.scopeType === "REPORT" && input.reportId && grant.scopeId === input.reportId) {
        return true;
      }
      return false;
    });
  }

  async listActive(organizationId: string, at = new Date()) {
    return this.prisma.entitlementGrant.findMany({
      where: {
        organizationId,
        revokedAt: null,
        validFrom: { lte: at },
        OR: [{ validUntil: null }, { validUntil: { gt: at } }],
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async canAccessFullReport(organizationId: string, reportId: string): Promise<boolean> {
    return this.hasEntitlement({
      organizationId,
      code: "xray.full_report",
      reportId,
    });
  }

  async canDownloadPdf(organizationId: string, reportId: string): Promise<boolean> {
    return this.hasEntitlement({
      organizationId,
      code: "xray.pdf_download",
      reportId,
    });
  }
}
