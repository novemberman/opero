import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@opero/database";
import { PRISMA_CLIENT } from "../database/database.constants";

export type AuditWriteInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  organizationId?: string | null;
  actorUserId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class AuditService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async record(input: AuditWriteInput): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        organizationId: input.organizationId ?? null,
        actorUserId: input.actorUserId ?? null,
        requestId: input.requestId ?? null,
        metadata: input.metadata
          ? (JSON.parse(JSON.stringify(input.metadata)) as never)
          : undefined,
      },
    });
  }
}
