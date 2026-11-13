import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
} from "@nestjs/common";
import type { PrismaClient } from "@opero/database";
import type { PaymentProvider } from "@opero/payments";
import type { Request } from "express";
import { PRISMA_CLIENT } from "../database/database.constants";
import { FulfillmentService } from "./fulfillment.service";
import { PAYMENT_PROVIDER } from "./payment.tokens";

/**
 * Korapay webhook endpoint — CSRF exempt, unauthenticated, signature-verified.
 * Always acknowledge with 200 after durable event recording to stop retries for
 * invalid signatures (per Korapay guidance) while never granting value.
 */
@Controller("billing/webhooks")
export class BillingWebhooksController {
  private readonly logger = new Logger(BillingWebhooksController.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly fulfillment: FulfillmentService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
  ) {}

  @Post("korapay")
  @HttpCode(200)
  async korapay(
    @Req() req: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const body = req.body as unknown;
    const signatureValid = this.payments.verifyWebhookSignature({ body, headers });
    let parsed;
    try {
      parsed = this.payments.parseWebhookEvent({ body, headers });
    } catch (error) {
      this.logger.warn(`Webhook parse failed: ${String(error)}`);
      return { received: true };
    }

    const payment = parsed.reference
      ? await this.prisma.payment.findUnique({ where: { reference: parsed.reference } })
      : null;

    // Invalid signatures must not consume the durable dedupe key of a real event.
    const providerEventKey = signatureValid
      ? parsed.providerEventKey
      : `invalid:${parsed.providerEventKey}:${Date.now()}`;

    try {
      await this.prisma.paymentEvent.create({
        data: {
          paymentId: payment?.id ?? null,
          organizationId: payment?.organizationId ?? null,
          provider: this.payments.name,
          eventType: parsed.eventType,
          providerEventKey,
          reference: parsed.reference || "unknown",
          payload: body as object,
          signatureValid,
          processResult: signatureValid ? "accepted" : "invalid_signature",
          processedAt: new Date(),
        },
      });
    } catch {
      // Unique providerEventKey → replay / duplicate. Idempotent no-op.
      return { received: true, duplicate: true };
    }

    if (!signatureValid) {
      return { received: true, valid: false };
    }

    if (!payment) {
      return { received: true, valid: true, matched: false };
    }

    if (parsed.eventType === "charge.success") {
      try {
        // Always re-verify with Korapay before granting value — never trust webhook alone.
        const verified = await this.payments.verifyTransaction(payment.reference);
        await this.fulfillment.fulfillVerifiedPayment({
          reference: payment.reference,
          verified,
          requestId: req.requestId,
        });
      } catch (error) {
        this.logger.warn(`Webhook fulfillment deferred: ${String(error)}`);
      }
    } else if (parsed.eventType === "charge.failed") {
      try {
        const verified = await this.payments.verifyTransaction(payment.reference);
        await this.fulfillment.fulfillVerifiedPayment({
          reference: payment.reference,
          verified,
          requestId: req.requestId,
        });
      } catch (error) {
        this.logger.warn(`Webhook failure handling deferred: ${String(error)}`);
      }
    } else if (parsed.eventType === "refund.success") {
      try {
        // `parsed.reference` is the original payment reference for refund events.
        await this.fulfillment.applyRefund({
          reference: parsed.reference || payment.reference,
          requestId: req.requestId,
        });
      } catch (error) {
        this.logger.warn(`Webhook refund handling deferred: ${String(error)}`);
      }
    }

    return { received: true, valid: true };
  }
}
