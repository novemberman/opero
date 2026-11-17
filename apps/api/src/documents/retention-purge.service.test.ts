import { describe, expect, it, vi } from "vitest";
import { RetentionPurgeService } from "./retention-purge.service";

describe("RetentionPurgeService dry-run", () => {
  it("lists only soft-deleted documents past retentionUntil and never mutates", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "doc-1",
        organizationId: "org-1",
        originalFilename: "aged.csv",
        deletionStatus: "DELETED",
        retentionUntil: new Date("2020-01-01T00:00:00.000Z"),
        deletedAt: new Date("2020-01-02T00:00:00.000Z"),
        storageKey: "org/org-1/documents/doc-1",
        quarantineKey: null,
      },
    ]);
    const prisma = { document: { findMany } } as never;
    const service = new RetentionPurgeService(prisma);

    const at = new Date("2021-01-01T00:00:00.000Z");
    const result = await service.dryRun({ at, organizationId: "org-1", limit: 10 });

    expect(result.mode).toBe("DRY_RUN");
    expect(result.candidateCount).toBe(1);
    expect(result.candidates[0]).toMatchObject({
      documentId: "doc-1",
      organizationId: "org-1",
      deletionStatus: "DELETED",
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletionStatus: "DELETED",
          organizationId: "org-1",
          retentionUntil: { lt: at },
        }),
      }),
    );
    expect(result.notes.join(" ")).toMatch(/No objects or database rows were deleted/i);
  });
});
