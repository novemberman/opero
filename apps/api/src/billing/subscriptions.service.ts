import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaClient } from "@opero/database";
import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/database.constants";
import type { AuthenticatedUser } from "../types/express";

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string) {
    return this.prisma.subscription.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        plan: { select: { code: true, name: true } },
        events: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
  }

  async cancelAtPeriodEnd(input: {
    organizationId: string;
    subscriptionId: string;
    actor: AuthenticatedUser;
    requestId?: string;
  }) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: input.subscriptionId, organizationId: input.organizationId },
    });
    if (!sub) throw new NotFoundException("Subscription not found");
    if (sub.status !== "ACTIVE" && sub.status !== "GRACE" && sub.status !== "PAST_DUE") {
      throw new BadRequestException(`Cannot cancel subscription in status ${sub.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          cancelAtPeriodEnd: true,
          canceledAt: new Date(),
        },
      });
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          organizationId: input.organizationId,
          fromStatus: sub.status,
          toStatus: sub.status,
          reason: "cancel_at_period_end",
        },
      });
      return next;
    });

    await this.audit.record({
      action: "billing.subscription_cancel_scheduled",
      entityType: "subscription",
      entityId: sub.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: {
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: true,
      },
    });

    return updated;
  }

  /**
   * Subscriptions due for an explicitly authorized renewal checkout.
   * Never initiates a charge — Korapay Direct Debit is not assumed available.
   */
  async listDueForRenewalReminder(organizationId: string, withinDays = 7, at = new Date()) {
    const horizon = new Date(at.getTime() + withinDays * 24 * 60 * 60 * 1000);
    return this.prisma.subscription.findMany({
      where: {
        organizationId,
        status: { in: ["ACTIVE", "GRACE", "PAST_DUE"] },
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { lte: horizon },
      },
      include: { plan: { select: { code: true, name: true } } },
      orderBy: { currentPeriodEnd: "asc" },
    });
  }

  /**
   * Records a renewal reminder audit event. Does not debit the customer.
   */
  async recordRenewalReminder(input: {
    organizationId: string;
    subscriptionId: string;
    actor: AuthenticatedUser;
    requestId?: string;
  }) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: input.subscriptionId, organizationId: input.organizationId },
      include: { plan: { select: { code: true, name: true } } },
    });
    if (!sub) throw new NotFoundException("Subscription not found");
    await this.audit.record({
      action: "billing.subscription_renewal_reminder",
      entityType: "subscription",
      entityId: sub.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: {
        planCode: sub.plan.code,
        currentPeriodEnd: sub.currentPeriodEnd,
        status: sub.status,
        // Explicit: reminder only — no automatic debit.
        autoDebit: false,
        renewalPath: "SUBSCRIPTION_RENEW_checkout",
      },
    });
    return {
      subscriptionId: sub.id,
      planCode: sub.plan.code,
      currentPeriodEnd: sub.currentPeriodEnd,
      reminderRecorded: true,
      autoDebit: false as const,
    };
  }

  /**
   * Applies period expiry / grace transitions. Safe to call from verify paths
   * or a future worker. Does not charge the customer.
   */
  async refreshStatus(organizationId: string, subscriptionId: string, at = new Date()) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, organizationId },
    });
    if (!sub) throw new NotFoundException("Subscription not found");

    let next = sub.status;
    if (sub.status === "ACTIVE" && sub.currentPeriodEnd && at > sub.currentPeriodEnd) {
      next = sub.graceUntil && at <= sub.graceUntil ? "GRACE" : "EXPIRED";
    } else if (sub.status === "GRACE" && sub.graceUntil && at > sub.graceUntil) {
      next = "EXPIRED";
    } else if (
      sub.cancelAtPeriodEnd &&
      sub.currentPeriodEnd &&
      at > sub.currentPeriodEnd &&
      (sub.status === "ACTIVE" || sub.status === "GRACE")
    ) {
      next = "CANCELED";
    }

    if (next === sub.status) return sub;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.subscription.update({
        where: { id: sub.id },
        data: { status: next },
      });
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          organizationId,
          fromStatus: sub.status,
          toStatus: next,
          reason: "lifecycle_refresh",
        },
      });
      if (next === "EXPIRED" || next === "CANCELED") {
        await tx.entitlementGrant.updateMany({
          where: {
            organizationId,
            sourceType: "SUBSCRIPTION",
            sourceId: sub.id,
            revokedAt: null,
          },
          data: {
            revokedAt: at,
            revokeReason: next === "CANCELED" ? "subscription_canceled" : "subscription_expired",
            validUntil: at,
          },
        });
      }
      return row;
    });

    await this.audit.record({
      action: "billing.subscription_status_changed",
      entityType: "subscription",
      entityId: sub.id,
      organizationId,
      metadata: { from: sub.status, to: next },
    });

    return updated;
  }
}
