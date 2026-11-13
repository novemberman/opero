import type { PrismaClient } from "@opero/database";
import { MemoryObjectStorage } from "@opero/object-storage";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { renderReportVersion, type ReportRenderJob } from "./render-report-version";

const BUCKET = "documents";
const ORG = "11111111-1111-4111-8111-111111111111";
const REPORT = "22222222-2222-4222-8222-222222222222";
const VERSION = "33333333-3333-4333-8333-333333333333";
const KEY = `org/${ORG}/reports/${REPORT}/${VERSION}.pdf`;

const job: ReportRenderJob = {
  organizationId: ORG,
  reportId: REPORT,
  reportVersionId: VERSION,
  actorUserId: "44444444-4444-4444-8444-444444444444",
};

type VersionRow = {
  id: string;
  reportId: string;
  organizationId: string;
  status: string;
  storageKey: string | null;
  contentHash: string | null;
  disclosures: unknown;
};

function versionRow(overrides: Partial<VersionRow> = {}): VersionRow {
  return {
    id: VERSION,
    reportId: REPORT,
    organizationId: ORG,
    status: "PUBLISHED",
    storageKey: KEY,
    contentHash: null,
    disclosures: {
      verifiedPublication: true,
      generatedAt: "2026-11-13T10:00:00.000Z",
      additionalDisclosures: [],
    },
    ...overrides,
  };
}

function fakePrisma(row: VersionRow, audits: unknown[] = []) {
  return {
    xRayReportVersion: {
      findFirst: async () => row,
      update: async () => {
        throw new Error("published artifacts must not be updated");
      },
    },
    auditEvent: {
      create: async ({ data }: { data: unknown }) => {
        audits.push(data);
        return data;
      },
    },
  } as unknown as PrismaClient;
}

describe("renderReportVersion", () => {
  it("skips when the stored object matches the published hash", async () => {
    const storage = new MemoryObjectStorage();
    const pdf = Buffer.from("%PDF-1.4 intact");
    const hash = createHash("sha256").update(pdf).digest("hex");
    await storage.putObject({ bucket: BUCKET, key: KEY, body: pdf });
    const audits: unknown[] = [];
    const outcome = await renderReportVersion(
      fakePrisma(versionRow({ contentHash: hash }), audits),
      storage,
      BUCKET,
      job,
    );
    expect(outcome).toBe("SKIPPED");
    expect(audits).toEqual([]);
  });

  it("fails closed when the published object is missing", async () => {
    const storage = new MemoryObjectStorage();
    const audits: unknown[] = [];
    const outcome = await renderReportVersion(
      fakePrisma(
        versionRow({ contentHash: "abc", storageKey: KEY }),
        audits,
      ),
      storage,
      BUCKET,
      job,
    );
    expect(outcome).toBe("INTEGRITY_FAILURE");
    expect(audits).toEqual([
      expect.objectContaining({
        action: "report.pdf_integrity_failed",
        metadata: expect.objectContaining({ reason: "MISSING_OBJECT" }),
      }),
    ]);
  });

  it("fails closed when the published object hash mismatches", async () => {
    const storage = new MemoryObjectStorage();
    await storage.putObject({
      bucket: BUCKET,
      key: KEY,
      body: Buffer.from("%PDF-1.4 tampered"),
    });
    const audits: unknown[] = [];
    const outcome = await renderReportVersion(
      fakePrisma(versionRow({ contentHash: "not-the-hash" }), audits),
      storage,
      BUCKET,
      job,
    );
    expect(outcome).toBe("INTEGRITY_FAILURE");
    expect(audits).toEqual([
      expect.objectContaining({
        action: "report.pdf_integrity_failed",
        metadata: expect.objectContaining({ reason: "HASH_MISMATCH" }),
      }),
    ]);
  });

  it("skips non-published versions without touching storage", async () => {
    const storage = new MemoryObjectStorage();
    const outcome = await renderReportVersion(
      fakePrisma(versionRow({ status: "DRAFT" })),
      storage,
      BUCKET,
      job,
    );
    expect(outcome).toBe("SKIPPED");
  });
});
