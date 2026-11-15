/**
 * Isolated B2.2 Increment A migration validation (no staging/prod data).
 * Run: DATABASE_URL=... pnpm --filter @opero/database exec tsx ../../scripts/b22a-migrate-validate.ts
 */
import { createPrismaClient, FinancialConcept } from "../packages/database/src/index.ts";

const NEW = [
  "PROFIT_BEFORE_TAX",
  "INCOME_TAX_EXPENSE",
  "OPENING_CASH_AND_EQUIVALENTS",
  "INVESTING_CASH_FLOW",
  "FINANCING_CASH_FLOW",
  "NET_CHANGE_IN_CASH",
] as const;

const LEGACY = [
  "REVENUE",
  "COST_OF_GOODS_SOLD",
  "GROSS_PROFIT",
  "OPERATING_EXPENSES",
  "OPERATING_PROFIT",
  "NET_PROFIT",
  "CASH_AND_EQUIVALENTS",
  "ACCOUNTS_RECEIVABLE",
  "ACCOUNTS_PAYABLE",
  "INVENTORY",
  "CURRENT_ASSETS",
  "CURRENT_LIABILITIES",
  "TOTAL_ASSETS",
  "TOTAL_LIABILITIES",
  "EQUITY",
  "INTEREST_BEARING_DEBT",
  "INTEREST_EXPENSE",
  "OPERATING_CASH_FLOW",
  "CAPITAL_EXPENDITURE",
  "UNMAPPED",
] as const;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const prisma = createPrismaClient(process.env.DATABASE_URL);

  const enumRows = await prisma.$queryRaw<Array<{ label: string }>>`
    SELECT e.enumlabel AS label
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'FinancialConcept'
    ORDER BY e.enumsortorder
  `;
  const labels = enumRows.map((r) => r.label);

  for (const c of [...LEGACY, ...NEW]) {
    if (!labels.includes(c)) {
      console.error("missing enum value", c);
      process.exit(1);
    }
  }
  for (const c of NEW) {
    if (!Object.values(FinancialConcept).includes(c)) {
      console.error("Prisma FinancialConcept missing", c);
      process.exit(1);
    }
  }

  const suffix = `${Date.now()}`;
  const org = await prisma.organization.create({
    data: { name: "B22A Migrate Check", slug: `b22a-migrate-${suffix}` },
  });
  const user = await prisma.user.create({
    data: {
      email: `b22a-migrate-${suffix}@example.com`,
      passwordHash: "x",
      name: "B22A",
    },
  });
  await prisma.membership.create({
    data: { organizationId: org.id, userId: user.id, role: "OWNER" },
  });
  const doc = await prisma.document.create({
    data: {
      organizationId: org.id,
      uploadedByUserId: user.id,
      originalFilename: "migrate-check.pdf",
      mimeType: "application/pdf",
      format: "PDF",
      byteSize: 1n,
      sha256: `b22a-${suffix}`,
      storageKey: `migrate-check-${suffix}`,
      processingStatus: "READY",
      scanStatus: "CLEAN",
      extractionStatus: "SUCCEEDED",
    },
  });
  const extraction = await prisma.documentExtraction.create({
    data: {
      organizationId: org.id,
      documentId: doc.id,
      method: "b22a-validate",
      quality: "HIGH",
      status: "SUCCEEDED",
    },
  });
  const statement = await prisma.financialStatement.create({
    data: {
      organizationId: org.id,
      documentId: doc.id,
      extractionId: extraction.id,
      statementType: "INCOME_STATEMENT",
      currency: "NGN",
    },
  });

  const oldLine = await prisma.financialLineItem.create({
    data: {
      organizationId: org.id,
      statementId: statement.id,
      concept: "NET_PROFIT",
      labelRaw: "Profit for the year",
      rawValue: "100",
      normalizedValue: "100",
      extractionMethod: "validate",
      quality: "HIGH",
      reviewStatus: "CONFIRMED",
    },
  });

  const createdNew = [];
  for (const concept of NEW) {
    createdNew.push(
      await prisma.financialLineItem.create({
        data: {
          organizationId: org.id,
          statementId: statement.id,
          concept,
          labelRaw: concept,
          rawValue: "1",
          normalizedValue: "1",
          extractionMethod: "validate",
          quality: "HIGH",
        },
      }),
    );
  }

  const readOld = await prisma.financialLineItem.findUnique({ where: { id: oldLine.id } });
  const pendingNew = await prisma.financialLineItem.findMany({
    where: { id: { in: createdNew.map((l) => l.id) } },
  });

  const result = {
    enumCount: labels.length,
    legacyIntact: LEGACY.every((c) => labels.includes(c)),
    newPresent: NEW.every((c) => labels.includes(c)),
    oldReadable: readOld?.concept === "NET_PROFIT" && readOld.reviewStatus === "CONFIRMED",
    newWritable: pendingNew.length === NEW.length,
    newAllPending: pendingNew.every((l) => l.reviewStatus === "PENDING"),
    prismaClientHasNew: NEW.every((c) => Object.values(FinancialConcept).includes(c)),
  };
  console.log(JSON.stringify(result, null, 2));

  const ok =
    result.enumCount === 26 &&
    result.legacyIntact &&
    result.newPresent &&
    result.oldReadable &&
    result.newWritable &&
    result.newAllPending &&
    result.prismaClientHasNew;

  await prisma.$disconnect();
  if (!ok) process.exit(1);
  console.log("b22a_migrate_validate_ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
