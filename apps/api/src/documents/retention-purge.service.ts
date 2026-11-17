import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@opero/database";
import { PRISMA_CLIENT } from "../database/database.constants";

export type RetentionPurgeCandidate = {
  organizationId: string;
  documentId: string;
  filename: string | null;
  deletionStatus: string;
  retentionUntil: string;
  deletedAt: string | null;
  storageKey: string | null;
  quarantineKey: string | null;
};

/**
 * Read-only retention candidate selection (D-P1-011 dry-run).
 * Never deletes objects or rows — execute path requires owner policy + separate flag.
 */
@Injectable()
export class RetentionPurgeService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  /**
   * Candidates for future hard-purge: soft-deleted documents past retentionUntil.
   * ACTIVE aged documents are intentionally excluded until product policy decides.
   */
  async listExpiredSoftDeleted(input: {
    at?: Date;
    organizationId?: string;
    limit?: number;
  } = {}): Promise<RetentionPurgeCandidate[]> {
    const at = input.at ?? new Date();
    const rows = await this.prisma.document.findMany({
      where: {
        deletionStatus: "DELETED",
        retentionUntil: { lt: at },
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      },
      orderBy: { retentionUntil: "asc" },
      take: Math.min(Math.max(input.limit ?? 100, 1), 1000),
      select: {
        id: true,
        organizationId: true,
        originalFilename: true,
        deletionStatus: true,
        retentionUntil: true,
        deletedAt: true,
        storageKey: true,
        quarantineKey: true,
      },
    });

    return rows.map((row) => ({
      organizationId: row.organizationId,
      documentId: row.id,
      filename: row.originalFilename,
      deletionStatus: row.deletionStatus,
      retentionUntil: (row.retentionUntil ?? new Date(0)).toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
      storageKey: row.storageKey,
      quarantineKey: row.quarantineKey,
    }));
  }

  /** Dry-run summary for ops — no side effects. */
  async dryRun(input: { at?: Date; organizationId?: string; limit?: number } = {}) {
    const candidates = await this.listExpiredSoftDeleted(input);
    return {
      mode: "DRY_RUN" as const,
      evaluatedAt: (input.at ?? new Date()).toISOString(),
      candidateCount: candidates.length,
      candidates,
      notes: [
        "No objects or database rows were deleted.",
        "Execute path is not enabled in this RC — owner policy required for hard purge + legal hold.",
        "Soft-delete already best-effort removes object bytes at delete time.",
      ],
    };
  }
}
