import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { FinancialStatement, Prisma, PrismaClient } from "@opero/database";
import type { UpdateStatementMetadataBody } from "@opero/shared";
import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/database.constants";
import type { AuthenticatedUser } from "../types/express";

const METADATA_FIELDS = [
  "periodType",
  "fiscalYearEndMonth",
  "consolidationScope",
  "entityName",
  "currency",
  "periodStart",
  "periodEnd",
  "periodLabel",
] as const;

type MetadataField = (typeof METADATA_FIELDS)[number];
type MetadataValues = Record<MetadataField, string | number | null>;

@Injectable()
export class StatementsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  async getMetadata(organizationId: string, statementId: string) {
    const statement = await this.requireStatement(organizationId, statementId);
    const history = await this.prisma.financialMetadataReview.findMany({
      where: { organizationId, financialStatementId: statement.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        previousValues: true,
        nextValues: true,
        note: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
      },
    });
    return { metadata: presentMetadata(statement), history };
  }

  async updateMetadata(input: {
    organizationId: string;
    statementId: string;
    actor: AuthenticatedUser;
    body: UpdateStatementMetadataBody;
    requestId?: string;
  }) {
    const statement = await this.requireStatement(input.organizationId, input.statementId);
    const current = metadataValues(statement);

    const changes: Partial<MetadataValues> = {};
    for (const field of METADATA_FIELDS) {
      const next = input.body[field];
      if (next !== undefined && next !== current[field]) {
        changes[field] = next;
      }
    }
    const changedFields = Object.keys(changes) as MetadataField[];
    const confirm = input.body.confirm === true;
    if (changedFields.length === 0 && !confirm) {
      throw new BadRequestException("No metadata changes were provided");
    }

    const merged = { ...current, ...changes };
    if (
      typeof merged.periodStart === "string" &&
      typeof merged.periodEnd === "string" &&
      merged.periodStart > merged.periodEnd
    ) {
      throw new BadRequestException("periodStart must not be after periodEnd");
    }

    const wasConfirmed = statement.confirmedAt !== null;
    // An edit without confirmation invalidates any earlier confirmation.
    const willBeConfirmed = confirm || (wasConfirmed && changedFields.length === 0);

    const data: Prisma.FinancialStatementUncheckedUpdateInput = {};
    for (const field of changedFields) {
      const value = changes[field];
      if (field === "periodStart" || field === "periodEnd") {
        data[field] = typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : null;
      } else {
        (data as Record<string, unknown>)[field] = value;
      }
    }
    if (confirm) {
      data.confirmedAt = new Date();
      data.confirmedByUserId = input.actor.id;
    } else if (!willBeConfirmed) {
      data.confirmedAt = null;
      data.confirmedByUserId = null;
    }

    const previousValues: Record<string, unknown> = { confirmed: wasConfirmed };
    const nextValues: Record<string, unknown> = { confirmed: willBeConfirmed };
    for (const field of changedFields) {
      previousValues[field] = current[field];
      nextValues[field] = changes[field];
    }

    const { updated, review } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.financialStatement.update({
        where: { id: statement.id },
        data,
      });
      const review = await tx.financialMetadataReview.create({
        data: {
          organizationId: input.organizationId,
          financialStatementId: statement.id,
          actorUserId: input.actor.id,
          previousValues: previousValues as Prisma.InputJsonValue,
          nextValues: nextValues as Prisma.InputJsonValue,
          note: input.body.note ?? null,
        },
      });
      return { updated, review };
    });

    await this.audit.record({
      action: confirm ? "statement.metadata_confirmed" : "statement.metadata_updated",
      entityType: "financial_statement",
      entityId: statement.id,
      organizationId: input.organizationId,
      actorUserId: input.actor.id,
      requestId: input.requestId,
      metadata: { changedFields, confirmed: willBeConfirmed },
    });

    return { metadata: presentMetadata(updated), review };
  }

  private async requireStatement(organizationId: string, statementId: string) {
    const statement = await this.prisma.financialStatement.findFirst({
      where: {
        id: statementId,
        organizationId,
        document: { deletionStatus: "ACTIVE" },
      },
    });
    if (!statement) throw new NotFoundException("Statement not found");
    return statement;
  }
}

function toDateString(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function metadataValues(statement: FinancialStatement): MetadataValues {
  return {
    periodType: statement.periodType,
    fiscalYearEndMonth: statement.fiscalYearEndMonth,
    consolidationScope: statement.consolidationScope,
    entityName: statement.entityName,
    currency: statement.currency,
    periodStart: toDateString(statement.periodStart),
    periodEnd: toDateString(statement.periodEnd),
    periodLabel: statement.periodLabel,
  };
}

function presentMetadata(statement: FinancialStatement) {
  return {
    statementId: statement.id,
    documentId: statement.documentId,
    statementType: statement.statementType,
    unitScale: statement.unitScale,
    ...metadataValues(statement),
    extractedMetadata: statement.extractedMetadata,
    confirmedAt: statement.confirmedAt,
    confirmedByUserId: statement.confirmedByUserId,
    updatedAt: statement.updatedAt,
  };
}
