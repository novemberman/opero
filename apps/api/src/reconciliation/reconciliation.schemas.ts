import { z } from "zod";

/** Detect conflicts either from a completed diagnostic run or from a set of documents. */
export const detectReconciliationsBodySchema = z
  .object({
    diagnosticRunId: z.uuid().optional(),
    documentIds: z.array(z.uuid()).min(1).max(20).optional(),
  })
  .strict()
  .refine((body) => (body.diagnosticRunId === undefined) !== (body.documentIds === undefined), {
    message: "Provide exactly one of diagnosticRunId or documentIds",
  });

export type DetectReconciliationsBody = z.infer<typeof detectReconciliationsBodySchema>;

export const listReconciliationsQuerySchema = z
  .object({
    status: z.enum(["OPEN", "RESOLVED", "DISMISSED", "ALL"]).default("OPEN"),
    diagnosticRunId: z.uuid().optional(),
  })
  .strict();

export type ListReconciliationsQuery = z.infer<typeof listReconciliationsQuerySchema>;
