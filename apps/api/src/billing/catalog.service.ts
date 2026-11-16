import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@opero/database";
import { formatNgnFromMinor } from "@opero/payments";
import {
  LIVE_PILOT_AMOUNT_MINOR,
  LIVE_PILOT_PRICE_CODE,
  LIVE_PILOT_PRODUCT_CODE,
} from "@opero/shared";
import { PRISMA_CLIENT } from "../database/database.constants";

@Injectable()
export class CatalogService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async getActivePricingVersion() {
    const now = new Date();
    const version = await this.prisma.pricingVersion.findFirst({
      where: {
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: { effectiveFrom: "desc" },
      include: {
        products: {
          where: { active: true },
          include: {
            prices: { where: { active: true } },
            plans: {
              where: { active: true },
              include: { entitlements: true, price: true },
            },
          },
        },
      },
    });
    if (!version) throw new NotFoundException("No active pricing version");
    return version;
  }

  async publicCatalog() {
    const version = await this.getActivePricingVersion();
    const products = version.products.filter((product) => product.code !== LIVE_PILOT_PRODUCT_CODE);
    return {
      pricingVersion: {
        code: version.code,
        label: version.label,
        effectiveFrom: version.effectiveFrom,
      },
      products: products.map((product) => ({
        code: product.code,
        name: product.name,
        description: product.description,
        kind: product.kind,
        prices: product.prices.map((price) => ({
          code: price.code,
          currency: price.currency,
          amountMinor: price.amountMinor,
          amountDisplay: formatNgnFromMinor(price.amountMinor),
          interval: price.interval,
        })),
        plans: product.plans.map((plan) => ({
          code: plan.code,
          name: plan.name,
          description: plan.description,
          entitlements: plan.entitlements.map((row) => ({
            code: row.entitlementCode,
            limitValue: row.limitValue,
          })),
        })),
      })),
    };
  }

  async requireActivePriceByProductCode(productCode: string) {
    if (productCode === LIVE_PILOT_PRODUCT_CODE) {
      throw new NotFoundException(`Product ${productCode} not found`);
    }
    const version = await this.getActivePricingVersion();
    const product = version.products.find((row) => row.code === productCode);
    if (!product) throw new NotFoundException(`Product ${productCode} not found`);
    const price = product.prices[0];
    if (!price) throw new NotFoundException(`No active price for ${productCode}`);
    return { version, product, price, plan: product.plans[0] ?? null };
  }

  /** Hidden ₦100 probe price — never exposed via public catalog helpers. */
  async requireLivePilotProbePrice() {
    const version = await this.getActivePricingVersion();
    const product = version.products.find((row) => row.code === LIVE_PILOT_PRODUCT_CODE);
    if (!product) throw new NotFoundException("Live pilot probe product not configured");
    const price =
      product.prices.find((row) => row.code === LIVE_PILOT_PRICE_CODE) ?? product.prices[0];
    if (!price) throw new NotFoundException("Live pilot probe price not configured");
    if (price.amountMinor !== LIVE_PILOT_AMOUNT_MINOR || price.currency !== "NGN") {
      throw new NotFoundException("Live pilot probe price misconfigured");
    }
    return { version, product, price };
  }
}
