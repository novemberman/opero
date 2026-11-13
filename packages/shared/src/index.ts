import { z } from "zod";

export {
  assignableMembershipRoleSchema,
  assignableMembershipRoles,
  membershipRoleSchema,
  membershipRoles,
  type AssignableMembershipRole,
  type MembershipRole,
} from "./roles";

export {
  permissions,
  roleHasEveryPermission,
  roleHasPermission,
  rolePermissions,
  type Permission,
} from "./permissions";

export const healthServiceSchema = z.enum(["web", "api", "worker"]);

export type HealthServiceName = z.infer<typeof healthServiceSchema>;

export const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: healthServiceSchema,
    timestamp: z.iso.datetime(),
  })
  .strict();

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export function createHealthResponse(
  service: HealthServiceName,
  now: Date = new Date(),
): HealthResponse {
  return healthResponseSchema.parse({
    status: "ok",
    service,
    timestamp: now.toISOString(),
  });
}

export const registerBodySchema = z
  .object({
    email: z.email().max(320),
    name: z.string().trim().min(1).max(120),
    password: z.string().min(12).max(200),
  })
  .strict();

export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z
  .object({
    email: z.email().max(320),
    password: z.string().min(1).max(200),
  })
  .strict();

export type LoginBody = z.infer<typeof loginBodySchema>;

export const verifyEmailBodySchema = z
  .object({
    token: z.string().min(1).max(500),
  })
  .strict();

export const forgotPasswordBodySchema = z
  .object({
    email: z.email().max(320),
  })
  .strict();

export const resetPasswordBodySchema = z
  .object({
    token: z.string().min(1).max(500),
    password: z.string().min(12).max(200),
  })
  .strict();

export const createOrganizationBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens"),
  })
  .strict();

export type CreateOrganizationBody = z.infer<typeof createOrganizationBodySchema>;

export const updateOrganizationBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export const inviteMemberBodySchema = z
  .object({
    email: z.email().max(320),
    role: z.enum(["ADMIN", "ANALYST", "VIEWER"]),
  })
  .strict();

export const changeMemberRoleBodySchema = z
  .object({
    role: z.enum(["OWNER", "ADMIN", "ANALYST", "VIEWER"]),
  })
  .strict();

export const acceptInvitationBodySchema = z
  .object({
    token: z.string().min(1).max(500),
    name: z.string().trim().min(1).max(120).optional(),
    password: z.string().min(12).max(200).optional(),
  })
  .strict();

export const documentFormatSchema = z.enum(["PDF", "XLSX", "CSV"]);

export const createDocumentUploadBodySchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    declaredMimeType: z.string().trim().min(1).max(200).optional(),
    declaredFormat: documentFormatSchema.optional(),
    expectedByteSize: z.number().int().positive().max(50_000_000).optional(),
  })
  .strict();

export const reviewLineItemBodySchema = z
  .object({
    lineItemId: z.uuid(),
    action: z.enum(["CONFIRM", "CORRECT", "REJECT"]),
    newValue: z.string().trim().min(1).max(64).optional(),
    newConcept: z
      .enum([
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
      ])
      .optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const DOCUMENTS_QUEUE = "documents" as const;

export type DocumentProcessJobPayload = {
  organizationId: string;
  documentId: string;
  processingJobId: string;
  actorUserId: string;
  correlationId?: string;
};

export const DIAGNOSTICS_QUEUE = "diagnostics" as const;

export const createDiagnosticRunBodySchema = z
  .object({
    documentIds: z.array(z.uuid()).min(1).max(20),
    currency: z
      .string()
      .trim()
      .min(3)
      .max(3)
      .regex(/^[A-Z]{3}$/)
      .optional(),
    periodLabel: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export type CreateDiagnosticRunBody = z.infer<typeof createDiagnosticRunBodySchema>;

export type DiagnosticRunJobPayload = {
  organizationId: string;
  diagnosticRunId: string;
  actorUserId: string;
  correlationId?: string;
};

export const periodTypeSchema = z.enum([
  "MONTHLY",
  "QUARTERLY",
  "ANNUAL",
  "CUSTOM",
  "UNKNOWN",
]);

export const consolidationScopeSchema = z.enum(["CONSOLIDATED", "ENTITY", "UNKNOWN"]);

export const updateStatementMetadataBodySchema = z
  .object({
    periodType: periodTypeSchema.optional(),
    fiscalYearEndMonth: z.number().int().min(1).max(12).nullable().optional(),
    consolidationScope: consolidationScopeSchema.optional(),
    entityName: z.string().trim().min(1).max(200).nullable().optional(),
    currency: z
      .string()
      .trim()
      .min(3)
      .max(3)
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .optional(),
    periodStart: z.string().date().nullable().optional(),
    periodEnd: z.string().date().nullable().optional(),
    periodLabel: z.string().trim().min(1).max(64).nullable().optional(),
    confirm: z.boolean().optional(),
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type UpdateStatementMetadataBody = z.infer<typeof updateStatementMetadataBodySchema>;

export const assessReadinessBodySchema = z
  .object({
    documentIds: z.array(z.uuid()).min(1).max(20),
    diagnosticRunId: z.uuid().optional(),
  })
  .strict();

export type AssessReadinessBody = z.infer<typeof assessReadinessBodySchema>;

export const resolveReconciliationBodySchema = z
  .object({
    resolution: z.enum(["SELECT_AUTHORITATIVE", "CORRECT_VALUE", "DISMISS"]),
    selectedLineItemId: z.uuid().optional(),
    correctedValue: z.string().trim().min(1).max(64).optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type ResolveReconciliationBody = z.infer<typeof resolveReconciliationBodySchema>;

export const createAiInterpretationBodySchema = z
  .object({
    diagnosticRunId: z.uuid(),
    userNotes: z.string().trim().max(2000).optional(),
  })
  .strict();

export type CreateAiInterpretationBody = z.infer<typeof createAiInterpretationBodySchema>;

export const editAiInterpretationBodySchema = z
  .object({
    summary: z.string().trim().min(1).max(4000).optional(),
    keyObservations: z.array(z.string().trim().min(1).max(1000)).max(20).optional(),
    risks: z.array(z.string().trim().min(1).max(1000)).max(20).optional(),
    limitations: z.array(z.string().trim().min(1).max(1000)).max(20).optional(),
  })
  .strict();

export type EditAiInterpretationBody = z.infer<typeof editAiInterpretationBodySchema>;

export const createXrayReportBodySchema = z
  .object({
    diagnosticRunId: z.uuid(),
    title: z.string().trim().min(1).max(200).optional(),
    aiInterpretationVersionId: z.uuid().optional(),
  })
  .strict();

export type CreateXrayReportBody = z.infer<typeof createXrayReportBodySchema>;

export const reportWorkflowBodySchema = z
  .object({
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type ReportWorkflowBody = z.infer<typeof reportWorkflowBodySchema>;

export const AI_QUEUE = "ai" as const;
export const REPORTS_QUEUE = "reports" as const;

export type AiInterpretJobPayload = {
  organizationId: string;
  aiInterpretationRunId: string;
  actorUserId: string;
  correlationId?: string;
  userNotes?: string;
};

export type ReportRenderJobPayload = {
  organizationId: string;
  reportId: string;
  reportVersionId: string;
  actorUserId: string;
  correlationId?: string;
};
