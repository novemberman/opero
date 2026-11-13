import type { PrismaClient } from "@opero/database";

/**
 * Removes Phase 6/7 rows (readiness, reconciliation, AI, reports, billing).
 * Several of them restrict deletion of diagnostic runs, organizations and users,
 * so suites that wipe those tables must call this first.
 */
export async function deletePhase6Data(prisma: PrismaClient): Promise<void> {
  await prisma.paymentEvent.deleteMany();
  await prisma.entitlementGrant.deleteMany();
  await prisma.subscriptionEvent.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.checkoutIntent.deleteMany();
  await prisma.enterpriseQuoteRequest.deleteMany();
  await prisma.reportAccessEvent.deleteMany();
  await prisma.reportApproval.deleteMany();
  await prisma.xRayReport.deleteMany();
  await prisma.aIInterpretationVersion.deleteMany();
  await prisma.aIInterpretationRun.deleteMany();
  await prisma.evidenceReconciliation.deleteMany();
  await prisma.diagnosticReadinessAssessment.deleteMany();
  await prisma.financialMetadataReview.deleteMany();
}
