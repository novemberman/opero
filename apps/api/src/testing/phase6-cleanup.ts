import type { PrismaClient } from "@opero/database";

/**
 * Removes Phase 6 rows (readiness, reconciliation, AI, reports). Several of
 * them restrict deletion of diagnostic runs, organizations and users, so
 * suites that wipe those tables must call this first.
 */
export async function deletePhase6Data(prisma: PrismaClient): Promise<void> {
  await prisma.reportAccessEvent.deleteMany();
  await prisma.reportApproval.deleteMany();
  await prisma.xRayReport.deleteMany();
  await prisma.aIInterpretationVersion.deleteMany();
  await prisma.aIInterpretationRun.deleteMany();
  await prisma.evidenceReconciliation.deleteMany();
  await prisma.diagnosticReadinessAssessment.deleteMany();
  await prisma.financialMetadataReview.deleteMany();
}
