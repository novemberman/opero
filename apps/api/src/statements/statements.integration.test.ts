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
  resetDatabase,
  seedDocument,
  signUp,
  testPrisma,
} from "../testing/phase6-fixtures";

describe("statement metadata integration", () => {
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

  it("corrects and confirms metadata with a full review history", async () => {
    const owner = await signUp(app, mail, "meta-owner");
    const organizationId = await createOrganization(app, owner, "meta");
    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: [{ ...FY2024, lines: [["REVENUE", "100"]] }],
    });
    const statementId = seeded.statementIds[0]!;
    const path = `/organizations/${organizationId}/statements/${statementId}/metadata`;

    const initial = await get(app, owner, path).expect(200);
    expect(initial.body.metadata).toMatchObject({
      statementId,
      documentId: seeded.documentId,
      periodType: "UNKNOWN",
      consolidationScope: "UNKNOWN",
      currency: "USD",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      confirmedAt: null,
    });
    expect(initial.body.history).toEqual([]);

    const corrected = await patch(app, owner, path)
      .send({
        periodType: "ANNUAL",
        fiscalYearEndMonth: 12,
        entityName: "Acme Holdings",
        note: "Annual accounts",
      })
      .expect(200);
    expect(corrected.body.metadata).toMatchObject({
      periodType: "ANNUAL",
      fiscalYearEndMonth: 12,
      entityName: "Acme Holdings",
      confirmedAt: null,
    });
    expect(corrected.body.review.previousValues).toEqual({
      confirmed: false,
      periodType: "UNKNOWN",
      fiscalYearEndMonth: null,
      entityName: null,
    });
    expect(corrected.body.review.nextValues).toEqual({
      confirmed: false,
      periodType: "ANNUAL",
      fiscalYearEndMonth: 12,
      entityName: "Acme Holdings",
    });

    const confirmed = await patch(app, owner, path).send({ confirm: true }).expect(200);
    expect(confirmed.body.metadata.confirmedAt).toBeTypeOf("string");
    expect(confirmed.body.metadata.confirmedByUserId).toBe(owner.userId);

    // Editing after confirmation without re-confirming withdraws the confirmation.
    const edited = await patch(app, owner, path).send({ currency: "EUR" }).expect(200);
    expect(edited.body.metadata.currency).toBe("EUR");
    expect(edited.body.metadata.confirmedAt).toBeNull();
    expect(edited.body.metadata.confirmedByUserId).toBeNull();

    const reconfirmed = await patch(app, owner, path)
      .send({ currency: "USD", confirm: true })
      .expect(200);
    expect(reconfirmed.body.metadata.currency).toBe("USD");
    expect(reconfirmed.body.metadata.confirmedAt).toBeTypeOf("string");

    const after = await get(app, owner, path).expect(200);
    expect(after.body.history).toHaveLength(4);
    // Newest first.
    expect(after.body.history[0].nextValues).toEqual({ confirmed: true, currency: "USD" });
    expect(after.body.history[1].previousValues).toEqual({ confirmed: true, currency: "USD" });
    expect(after.body.history[1].nextValues).toEqual({ confirmed: false, currency: "EUR" });
    expect(after.body.history[3].note).toBe("Annual accounts");
    expect(after.body.history[3].actor).toEqual({ id: owner.userId, name: "P6 meta-owner" });

    // Metadata review never touches extracted figures.
    const prisma = testPrisma();
    const line = await prisma.financialLineItem.findFirstOrThrow({ where: { statementId } });
    expect(line.rawValue).toBe("100");
    expect(line.normalizedValue).toBe("100");
    const audits = await prisma.auditEvent.findMany({
      where: { organizationId, entityId: statementId },
    });
    expect(audits.map((event) => event.action).sort()).toEqual([
      "statement.metadata_confirmed",
      "statement.metadata_confirmed",
      "statement.metadata_updated",
      "statement.metadata_updated",
    ]);
    await prisma.$disconnect();
  });

  it("validates input and enforces permissions and tenant isolation", async () => {
    const owner = await signUp(app, mail, "meta-owner2");
    const organizationId = await createOrganization(app, owner, "meta2");
    const seeded = await seedDocument({
      organizationId,
      userId: owner.userId,
      statements: [{ ...FY2024, lines: [["REVENUE", "100"]] }],
    });
    const statementId = seeded.statementIds[0]!;
    const path = `/organizations/${organizationId}/statements/${statementId}/metadata`;

    await patch(app, owner, path).send({}).expect(400);
    await patch(app, owner, path).send({ periodType: "ANNUAL", unknownField: 1 }).expect(400);
    await patch(app, owner, path).send({ currency: "usd" }).expect(400);
    await patch(app, owner, path).send({ fiscalYearEndMonth: 13 }).expect(400);
    await patch(app, owner, path)
      .send({ periodStart: "2025-01-01", periodEnd: "2024-12-31" })
      .expect(400);
    // Re-sending the current value is not a change.
    await patch(app, owner, path).send({ currency: "USD" }).expect(400);
    await get(app, owner, `/organizations/${organizationId}/statements/not-a-uuid/metadata`).expect(
      400,
    );

    const viewer = await signUp(app, mail, "meta-viewer");
    await addMember(organizationId, viewer.userId, "VIEWER");
    await get(app, viewer, path).expect(200);
    await patch(app, viewer, path).send({ periodType: "ANNUAL" }).expect(403);

    const outsider = await signUp(app, mail, "meta-outsider");
    const otherOrganizationId = await createOrganization(app, outsider, "meta-other");
    // Not a member of the organization.
    await get(app, outsider, path).expect(404);
    await patch(app, outsider, path).send({ periodType: "ANNUAL" }).expect(404);
    // A member elsewhere cannot reach the statement through their own organization.
    const crossPath = `/organizations/${otherOrganizationId}/statements/${statementId}/metadata`;
    await get(app, outsider, crossPath).expect(404);
    await patch(app, outsider, crossPath).send({ periodType: "ANNUAL" }).expect(404);

    const prisma = testPrisma();
    const statement = await prisma.financialStatement.findUniqueOrThrow({
      where: { id: statementId },
    });
    expect(statement.periodType).toBe("UNKNOWN");
    expect(
      await prisma.financialMetadataReview.count({ where: { financialStatementId: statementId } }),
    ).toBe(0);
    await prisma.$disconnect();
  });
});
