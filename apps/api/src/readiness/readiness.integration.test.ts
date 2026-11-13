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
  patch,
  post,
  resetDatabase,
  seedDocument,
  signUp,
  testPrisma,
} from "../testing/phase6-fixtures";

type ChecklistItem = { id: string; passed: boolean; required: boolean };
type Issue = { code: string; severity: string; blocking: boolean };

function failedChecks(checklist: ChecklistItem[]): string[] {
  return checklist.filter((item) => !item.passed).map((item) => item.id);
}

describe("readiness integration", () => {
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

  it("moves from BLOCKED to READY as metadata is corrected and confirmed", async () => {
    const owner = await signUp(app, mail, "ready-owner");
    const organizationId = await createOrganization(app, owner, "ready");
    // Extracted without currency or period: nothing can be computed safely.
    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: [{ lines: [["REVENUE", "100"]] }],
    });
    const body = { documentIds: [seeded.documentId] };
    const assessPath = `/organizations/${organizationId}/readiness/assess`;
    const metadataPath = `/organizations/${organizationId}/statements/${seeded.statementIds[0]}/metadata`;

    const empty = await get(app, owner, `/organizations/${organizationId}/readiness/latest`).expect(
      200,
    );
    expect(empty.body.assessment).toBeNull();

    const blocked = await post(app, owner, assessPath).send(body).expect(201);
    expect(blocked.body.assessment.status).toBe("BLOCKED");
    expect(blocked.body.assessment.documentIds).toEqual([seeded.documentId]);
    expect(blocked.body.assessment.blockingReasons).toEqual([
      "Missing currency metadata",
      "Missing period metadata",
    ]);
    expect(failedChecks(blocked.body.assessment.checklist)).toEqual([
      "currency_present",
      "period_present",
      "period_type_known",
      "metadata_confirmed",
    ]);

    // Fixing the blocking gaps leaves non-blocking review work.
    await patch(app, owner, metadataPath)
      .send({
        currency: FY2024.currency,
        periodStart: FY2024.periodStart,
        periodEnd: FY2024.periodEnd,
        periodLabel: FY2024.periodLabel,
      })
      .expect(200);
    const actionRequired = await post(app, owner, assessPath).send(body).expect(201);
    expect(actionRequired.body.assessment.status).toBe("ACTION_REQUIRED");
    expect(actionRequired.body.assessment.blockingReasons).toEqual([]);
    expect(
      (actionRequired.body.assessment.issues as Issue[]).map((issue) => issue.code).sort(),
    ).toEqual(["METADATA_UNCONFIRMED", "UNKNOWN_PERIOD_TYPE"]);

    await patch(app, owner, metadataPath)
      .send({ periodType: "ANNUAL", consolidationScope: "ENTITY", confirm: true })
      .expect(200);
    const ready = await post(app, owner, assessPath).send(body).expect(201);
    expect(ready.body.assessment.status).toBe("READY");
    expect(ready.body.assessment.issues).toEqual([]);
    expect(failedChecks(ready.body.assessment.checklist)).toEqual([]);

    // A pending line-item review takes the document out of READY again.
    const prisma = testPrisma();
    await prisma.financialLineItem.updateMany({
      where: { organizationId },
      data: { reviewStatus: "PENDING" },
    });
    const pending = await post(app, owner, assessPath).send(body).expect(201);
    expect(pending.body.assessment.status).toBe("ACTION_REQUIRED");
    expect((pending.body.assessment.issues as Issue[]).map((issue) => issue.code)).toEqual([
      "PENDING_REVIEWS",
    ]);

    // Every assessment is kept; `latest` returns the newest.
    expect(await prisma.diagnosticReadinessAssessment.count({ where: { organizationId } })).toBe(4);
    await prisma.$disconnect();
    const latest = await get(
      app,
      owner,
      `/organizations/${organizationId}/readiness/latest?documentIds=${seeded.documentId}`,
    ).expect(200);
    expect(latest.body.assessment.id).toBe(pending.body.assessment.id);
  });

  it("is BLOCKED by an open critical evidence conflict until it is resolved", async () => {
    const owner = await signUp(app, mail, "ready-conflict");
    const organizationId = await createOrganization(app, owner, "ready-conflict");
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
    const assessPath = `/organizations/${organizationId}/readiness/assess`;
    const body = { documentIds: [first.documentId, second.documentId] };

    const blocked = await post(app, owner, assessPath).send(body).expect(201);
    expect(blocked.body.assessment.status).toBe("BLOCKED");
    expect(blocked.body.assessment.blockingReasons).toEqual([
      "Unresolved critical evidence conflicts",
    ]);

    // The conflict only involves both documents together.
    const single = await post(app, owner, assessPath)
      .send({ documentIds: [first.documentId] })
      .expect(201);
    expect(single.body.assessment.status).toBe("ACTION_REQUIRED");

    const open = await get(app, owner, `/organizations/${organizationId}/reconciliations`).expect(
      200,
    );
    expect(open.body.reconciliations).toHaveLength(1);
    await post(
      app,
      owner,
      `/organizations/${organizationId}/reconciliations/${open.body.reconciliations[0].id}/resolve`,
    )
      .send({
        resolution: "SELECT_AUTHORITATIVE",
        selectedLineItemId: first.lineItemIds["FY2024:REVENUE"],
        reason: "Audited accounts take precedence",
      })
      .expect(200);

    const unblocked = await post(app, owner, assessPath).send(body).expect(201);
    expect(unblocked.body.assessment.status).toBe("ACTION_REQUIRED");
    expect(unblocked.body.assessment.blockingReasons).toEqual([]);
  });

  it("enforces permissions, validation and tenant isolation", async () => {
    const owner = await signUp(app, mail, "ready-authz");
    const organizationId = await createOrganization(app, owner, "ready-authz");
    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: [{ ...FY2024, lines: [["REVENUE", "100"]] }],
    });
    const assessPath = `/organizations/${organizationId}/readiness/assess`;
    await post(app, owner, assessPath).send({ documentIds: [seeded.documentId] }).expect(201);

    await post(app, owner, assessPath).send({ documentIds: [] }).expect(400);
    await post(app, owner, assessPath).send({ documentIds: ["not-a-uuid"] }).expect(400);
    await get(
      app,
      owner,
      `/organizations/${organizationId}/readiness/latest?documentIds=not-a-uuid`,
    ).expect(400);

    const viewer = await signUp(app, mail, "ready-viewer");
    await addMember(organizationId, viewer.userId, "VIEWER");
    await post(app, viewer, assessPath).send({ documentIds: [seeded.documentId] }).expect(403);
    const viewed = await get(
      app,
      viewer,
      `/organizations/${organizationId}/readiness/latest`,
    ).expect(200);
    expect(viewed.body.assessment.status).toBe("ACTION_REQUIRED");

    const outsider = await signUp(app, mail, "ready-outsider");
    const otherOrganizationId = await createOrganization(app, outsider, "ready-other");
    await post(app, outsider, assessPath).send({ documentIds: [seeded.documentId] }).expect(404);
    await get(app, outsider, `/organizations/${organizationId}/readiness/latest`).expect(404);
    // Another tenant's document cannot be assessed through one's own organization.
    await post(app, outsider, `/organizations/${otherOrganizationId}/readiness/assess`)
      .send({ documentIds: [seeded.documentId] })
      .expect(400);
    const none = await get(
      app,
      outsider,
      `/organizations/${otherOrganizationId}/readiness/latest`,
    ).expect(200);
    expect(none.body.assessment).toBeNull();
  });
});
