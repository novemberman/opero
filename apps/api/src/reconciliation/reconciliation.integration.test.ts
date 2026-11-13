import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../testing/app-factory";
import type { MemoryEmailService } from "../testing/memory-email.service";
import {
  FY2024,
  addMember,
  cleanupPhase6,
  createOrganization,
  get,
  post,
  resetDatabase,
  runDiagnostic,
  seedDocument,
  signUp,
  testPrisma,
} from "../testing/phase6-fixtures";

type Item = { id: string; lineItemId: string; value: string; isAuthoritative: boolean };
type Reconciliation = {
  id: string;
  concept: string;
  severity: string;
  status: string;
  conflictKey: string;
  diagnosticRunId: string | null;
  resolution: string | null;
  resolvedValue: string | null;
  resolvedByUserId: string | null;
  resolutionReason: string | null;
  resolvedAt: string | null;
  items: Item[];
};

function byConcept(rows: Reconciliation[], concept: string): Reconciliation {
  const found = rows.find((row) => row.concept === concept);
  if (!found) throw new Error(`No reconciliation for ${concept}`);
  return found;
}

describe("reconciliation integration", () => {
  let app: INestApplication;
  let mail: MemoryEmailService;

  beforeAll(async () => {
    await resetDatabase();
    ({ app, mail } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    await cleanupPhase6();
  });

  it("detects conflicts and records each kind of resolution", async () => {
    const owner = await signUp(app, mail, "recon-owner");
    const organizationId = await createOrganization(app, owner, "recon");
    const first = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: [
        {
          ...FY2024,
          lines: [
            ["REVENUE", "1000"],
            ["EQUITY", "600"],
            ["NET_PROFIT", "300"],
            ["CASH_AND_EQUIVALENTS", "200"],
            ["TOTAL_ASSETS", "1000"],
          ],
        },
      ],
    });
    const second = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: [
        {
          ...FY2024,
          lines: [
            ["REVENUE", "1300"],
            ["EQUITY", "610"],
            ["NET_PROFIT", "200"],
            ["CASH_AND_EQUIVALENTS", "100"],
            // Agrees with the first document: not a conflict.
            ["TOTAL_ASSETS", "1000"],
          ],
        },
      ],
    });
    const base = `/organizations/${organizationId}/reconciliations`;
    const documentIds = [first.documentId, second.documentId];

    await post(app, owner, `${base}/detect`).send({}).expect(400);
    await post(app, owner, `${base}/detect`)
      .send({ documentIds, diagnosticRunId: "0b0f6c5e-7c11-4c38-9f0a-3f2f2f1a0001" })
      .expect(400);

    const detected = await post(app, owner, `${base}/detect`).send({ documentIds }).expect(200);
    expect(detected.body).toMatchObject({ detected: 4, created: 4, closedStale: 0 });
    const rows = detected.body.reconciliations as Reconciliation[];
    expect(rows.map((row) => row.concept).sort()).toEqual([
      "CASH_AND_EQUIVALENTS",
      "EQUITY",
      "NET_PROFIT",
      "REVENUE",
    ]);
    const revenue = byConcept(rows, "REVENUE");
    const equity = byConcept(rows, "EQUITY");
    const netProfit = byConcept(rows, "NET_PROFIT");
    const cash = byConcept(rows, "CASH_AND_EQUIVALENTS");
    expect(revenue.severity).toBe("CRITICAL");
    // A material concept that differs by less than 5%.
    expect(equity.severity).toBe("HIGH");
    expect(revenue.status).toBe("OPEN");
    expect(revenue.items.map((item) => item.value).sort()).toEqual(["1000", "1300"]);

    // Detection is idempotent.
    const again = await post(app, owner, `${base}/detect`).send({ documentIds }).expect(200);
    expect(again.body).toMatchObject({ detected: 4, created: 0, closedStale: 0 });

    // SELECT_AUTHORITATIVE needs a line item that is a candidate of the conflict.
    const resolvePath = (id: string) => `${base}/${id}/resolve`;
    await post(app, owner, resolvePath(revenue.id))
      .send({ resolution: "SELECT_AUTHORITATIVE", reason: "No selection" })
      .expect(400);
    await post(app, owner, resolvePath(revenue.id))
      .send({
        resolution: "SELECT_AUTHORITATIVE",
        selectedLineItemId: first.lineItemIds["FY2024:EQUITY"],
        reason: "Wrong candidate",
      })
      .expect(400);
    await post(app, owner, resolvePath(revenue.id))
      .send({ resolution: "DISMISS" })
      .expect(400);

    const selected = await post(app, owner, resolvePath(revenue.id))
      .send({
        resolution: "SELECT_AUTHORITATIVE",
        selectedLineItemId: second.lineItemIds["FY2024:REVENUE"],
        reason: "Audited accounts take precedence",
      })
      .expect(200);
    const resolvedRevenue = selected.body.reconciliation as Reconciliation;
    expect(resolvedRevenue).toMatchObject({
      status: "RESOLVED",
      resolution: "SELECT_AUTHORITATIVE",
      resolvedValue: "1300",
      resolvedByUserId: owner.userId,
      resolutionReason: "Audited accounts take precedence",
    });
    expect(resolvedRevenue.resolvedAt).toBeTypeOf("string");
    expect(
      resolvedRevenue.items.filter((item) => item.isAuthoritative).map((item) => item.lineItemId),
    ).toEqual([second.lineItemIds["FY2024:REVENUE"]]);

    // A resolution is final.
    await post(app, owner, resolvePath(revenue.id))
      .send({ resolution: "DISMISS", reason: "Second attempt" })
      .expect(409);

    await post(app, owner, resolvePath(equity.id))
      .send({ resolution: "CORRECT_VALUE", reason: "No value" })
      .expect(400);
    await post(app, owner, resolvePath(equity.id))
      .send({ resolution: "CORRECT_VALUE", correctedValue: "about 605", reason: "Not numeric" })
      .expect(400);
    const corrected = await post(app, owner, resolvePath(equity.id))
      .send({ resolution: "CORRECT_VALUE", correctedValue: "605", reason: "Per ledger" })
      .expect(200);
    expect(corrected.body.reconciliation).toMatchObject({
      status: "RESOLVED",
      resolution: "CORRECT_VALUE",
      resolvedValue: "605",
      resolvedByUserId: owner.userId,
    });
    expect(
      (corrected.body.reconciliation.items as Item[]).some((item) => item.isAuthoritative),
    ).toBe(false);

    const dismissed = await post(app, owner, resolvePath(netProfit.id))
      .send({ resolution: "DISMISS", reason: "Different reporting basis" })
      .expect(200);
    expect(dismissed.body.reconciliation).toMatchObject({
      status: "DISMISSED",
      resolution: "DISMISS",
      resolvedValue: null,
      resolutionReason: "Different reporting basis",
    });

    // Resolving records a decision; it never rewrites extracted evidence.
    const prisma = testPrisma();
    const lines = await prisma.financialLineItem.findMany({
      where: { organizationId, concept: { in: ["REVENUE", "EQUITY"] } },
      select: { normalizedValue: true, reviewStatus: true },
    });
    expect(lines.map((line) => line.normalizedValue).sort()).toEqual([
      "1000",
      "1300",
      "600",
      "610",
    ]);
    expect(lines.every((line) => line.reviewStatus === "CONFIRMED")).toBe(true);

    // Once the evidence agrees, the remaining open conflict is closed on detection.
    await prisma.financialLineItem.update({
      where: { id: second.lineItemIds["FY2024:CASH_AND_EQUIVALENTS"]! },
      data: { normalizedValue: "200" },
    });
    const refreshed = await post(app, owner, `${base}/detect`).send({ documentIds }).expect(200);
    expect(refreshed.body).toMatchObject({ detected: 3, created: 0, closedStale: 1 });
    expect(refreshed.body.reconciliations).toEqual([]);
    const closed = await get(app, owner, `${base}/${cash.id}`).expect(200);
    expect(closed.body.reconciliation).toMatchObject({
      status: "DISMISSED",
      resolution: "DISMISS",
      resolvedByUserId: owner.userId,
    });

    const open = await get(app, owner, base).expect(200);
    expect(open.body.reconciliations).toEqual([]);
    const all = await get(app, owner, `${base}?status=ALL`).expect(200);
    expect(all.body.reconciliations).toHaveLength(4);
    await get(app, owner, `${base}?status=BOGUS`).expect(400);

    const audits = await prisma.auditEvent.count({
      where: { organizationId, action: "reconciliation.resolved" },
    });
    expect(audits).toBe(3);
    await prisma.$disconnect();
  });

  it("detects conflicts from a diagnostic run snapshot and enforces authorization", async () => {
    const owner = await signUp(app, mail, "recon-run");
    const organizationId = await createOrganization(app, owner, "recon-run");
    const first = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: [{ ...FY2024, lines: [["REVENUE", "1000"]] }],
    });
    const second = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: [{ ...FY2024, lines: [["REVENUE", "1300"]] }],
    });
    const base = `/organizations/${organizationId}/reconciliations`;
    const diagnosticRunId = await runDiagnostic(app, owner, organizationId, [
      first.documentId,
      second.documentId,
    ]);

    const detected = await post(app, owner, `${base}/detect`).send({ diagnosticRunId }).expect(200);
    expect(detected.body).toMatchObject({ detected: 1, created: 1 });
    const conflict = (detected.body.reconciliations as Reconciliation[])[0]!;
    expect(conflict).toMatchObject({
      concept: "REVENUE",
      severity: "CRITICAL",
      status: "OPEN",
      diagnosticRunId,
    });

    const filtered = await get(app, owner, `${base}?diagnosticRunId=${diagnosticRunId}`).expect(
      200,
    );
    expect(filtered.body.reconciliations).toHaveLength(1);

    const viewer = await signUp(app, mail, "recon-viewer");
    await addMember(organizationId, viewer.userId, "VIEWER");
    await get(app, viewer, base).expect(200);
    await post(app, viewer, `${base}/detect`).send({ diagnosticRunId }).expect(403);
    await post(app, viewer, `${base}/${conflict.id}/resolve`)
      .send({ resolution: "DISMISS", reason: "Viewer attempt" })
      .expect(403);

    const analyst = await signUp(app, mail, "recon-analyst");
    await addMember(organizationId, analyst.userId, "ANALYST");

    const outsider = await signUp(app, mail, "recon-outsider");
    const otherOrganizationId = await createOrganization(app, outsider, "recon-other");
    const otherBase = `/organizations/${otherOrganizationId}/reconciliations`;
    await get(app, outsider, base).expect(404);
    await post(app, outsider, `${base}/${conflict.id}/resolve`)
      .send({ resolution: "DISMISS", reason: "Outsider attempt" })
      .expect(404);
    // Another tenant's rows are unreachable through one's own organization.
    await get(app, outsider, `${otherBase}/${conflict.id}`).expect(404);
    await post(app, outsider, `${otherBase}/${conflict.id}/resolve`)
      .send({ resolution: "DISMISS", reason: "Cross-tenant attempt" })
      .expect(404);
    await post(app, outsider, `${otherBase}/detect`).send({ diagnosticRunId }).expect(404);
    await post(app, outsider, `${otherBase}/detect`)
      .send({ documentIds: [first.documentId] })
      .expect(400);
    const none = await get(app, outsider, `${otherBase}?status=ALL`).expect(200);
    expect(none.body.reconciliations).toEqual([]);

    const resolved = await post(app, analyst, `${base}/${conflict.id}/resolve`)
      .send({
        resolution: "SELECT_AUTHORITATIVE",
        selectedLineItemId: first.lineItemIds["FY2024:REVENUE"],
        reason: "Management accounts",
      })
      .expect(200);
    expect(resolved.body.reconciliation).toMatchObject({
      status: "RESOLVED",
      resolvedValue: "1000",
      resolvedByUserId: analyst.userId,
    });

    // Re-detection never reopens a recorded resolution.
    const again = await post(app, owner, `${base}/detect`).send({ diagnosticRunId }).expect(200);
    expect(again.body).toMatchObject({ detected: 1, created: 0 });
    expect(again.body.reconciliations).toEqual([]);
  });
});
