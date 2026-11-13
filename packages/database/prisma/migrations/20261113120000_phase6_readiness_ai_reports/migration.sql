-- Phase 6: readiness, evidence reconciliation, AI interpretation, X-Ray reports

CREATE TYPE "PeriodType" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM', 'UNKNOWN');
CREATE TYPE "ConsolidationScope" AS ENUM ('CONSOLIDATED', 'ENTITY', 'UNKNOWN');
CREATE TYPE "DiagnosticReadinessStatus" AS ENUM ('READY', 'PARTIALLY_READY', 'ACTION_REQUIRED', 'BLOCKED');
CREATE TYPE "ReadinessIssueSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');
CREATE TYPE "ReconciliationResolution" AS ENUM ('SELECT_AUTHORITATIVE', 'CORRECT_VALUE', 'DISMISS');
CREATE TYPE "AiInterpretationStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNAVAILABLE');
CREATE TYPE "XRayReportStatus" AS ENUM ('DRAFT', 'REVIEW_REQUIRED', 'APPROVED', 'PUBLISHED', 'REJECTED', 'SUPERSEDED');
CREATE TYPE "ReportApprovalAction" AS ENUM ('SUBMIT_REVIEW', 'APPROVE', 'REJECT', 'PUBLISH', 'SUPERSEDE');
CREATE TYPE "ReportAccessAction" AS ENUM ('VIEW', 'DOWNLOAD', 'PREVIEW');

ALTER TABLE "financial_statements"
  ADD COLUMN "period_type" "PeriodType" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "fiscal_year_end_month" INTEGER,
  ADD COLUMN "consolidation_scope" "ConsolidationScope" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "entity_name" TEXT,
  ADD COLUMN "extracted_metadata" JSONB,
  ADD COLUMN "confirmed_at" TIMESTAMP(3),
  ADD COLUMN "confirmed_by_user_id" UUID;

ALTER TABLE "financial_statements"
  ADD CONSTRAINT "financial_statements_confirmed_by_user_id_fkey"
  FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "financial_metadata_reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "financial_statement_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "previous_values" JSONB NOT NULL,
    "next_values" JSONB NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financial_metadata_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "diagnostic_readiness_assessments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "diagnostic_run_id" UUID,
    "document_ids" UUID[],
    "status" "DiagnosticReadinessStatus" NOT NULL,
    "checklist" JSONB NOT NULL,
    "issues" JSONB NOT NULL,
    "blocking_reasons" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "diagnostic_readiness_assessments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evidence_reconciliations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "diagnostic_run_id" UUID,
    "conflict_key" TEXT NOT NULL,
    "concept" "FinancialConcept",
    "severity" "ReadinessIssueSeverity" NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "candidates" JSONB NOT NULL,
    "resolution" "ReconciliationResolution",
    "resolved_value" TEXT,
    "resolved_by_user_id" UUID,
    "resolution_reason" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "evidence_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evidence_reconciliation_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "reconciliation_id" UUID NOT NULL,
    "document_id" UUID,
    "line_item_id" UUID,
    "label" TEXT NOT NULL,
    "value" TEXT,
    "currency" TEXT,
    "period_label" TEXT,
    "is_authoritative" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "evidence_reconciliation_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_interpretation_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "diagnostic_run_id" UUID NOT NULL,
    "initiated_by_user_id" UUID NOT NULL,
    "status" "AiInterpretationStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "prompt_version" TEXT NOT NULL,
    "failure_message" TEXT,
    "bull_job_id" TEXT,
    "request_id" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_interpretation_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_interpretation_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ai_interpretation_run_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "narrative" JSONB NOT NULL,
    "grounded_claims" JSONB NOT NULL,
    "unsupported_claims" JSONB NOT NULL,
    "edited_narrative" JSONB,
    "edited_by_user_id" UUID,
    "is_simulated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_interpretation_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "xray_reports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "diagnostic_run_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "status" "XRayReportStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "verified_publication" BOOLEAN NOT NULL DEFAULT false,
    "current_version_id" UUID,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "xray_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "xray_report_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "XRayReportStatus" NOT NULL,
    "snapshot_payload" JSONB NOT NULL,
    "ai_interpretation_version_id" UUID,
    "storage_key" TEXT,
    "content_hash" TEXT,
    "byte_size" INTEGER,
    "disclosures" JSONB,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "xray_report_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_approvals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "report_version_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" "ReportApprovalAction" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_access_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "report_version_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "action" "ReportAccessAction" NOT NULL,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_access_events_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "financial_metadata_reviews_organization_id_financial_statement_id_idx"
  ON "financial_metadata_reviews"("organization_id", "financial_statement_id");
CREATE INDEX "diagnostic_readiness_assessments_organization_id_created_at_idx"
  ON "diagnostic_readiness_assessments"("organization_id", "created_at");
CREATE INDEX "diagnostic_readiness_assessments_diagnostic_run_id_idx"
  ON "diagnostic_readiness_assessments"("diagnostic_run_id");
CREATE UNIQUE INDEX "evidence_reconciliations_organization_id_conflict_key_diagnostic_run_id_key"
  ON "evidence_reconciliations"("organization_id", "conflict_key", "diagnostic_run_id");
CREATE INDEX "evidence_reconciliations_organization_id_status_idx"
  ON "evidence_reconciliations"("organization_id", "status");
CREATE INDEX "evidence_reconciliation_items_organization_id_reconciliation_id_idx"
  ON "evidence_reconciliation_items"("organization_id", "reconciliation_id");
CREATE INDEX "ai_interpretation_runs_organization_id_diagnostic_run_id_idx"
  ON "ai_interpretation_runs"("organization_id", "diagnostic_run_id");
CREATE INDEX "ai_interpretation_runs_organization_id_status_idx"
  ON "ai_interpretation_runs"("organization_id", "status");
CREATE UNIQUE INDEX "ai_interpretation_versions_ai_interpretation_run_id_version_number_key"
  ON "ai_interpretation_versions"("ai_interpretation_run_id", "version_number");
CREATE INDEX "ai_interpretation_versions_organization_id_idx"
  ON "ai_interpretation_versions"("organization_id");
CREATE INDEX "xray_reports_organization_id_created_at_idx"
  ON "xray_reports"("organization_id", "created_at");
CREATE INDEX "xray_reports_organization_id_status_idx"
  ON "xray_reports"("organization_id", "status");
CREATE UNIQUE INDEX "xray_reports_current_version_id_key"
  ON "xray_reports"("current_version_id");
CREATE UNIQUE INDEX "xray_report_versions_report_id_version_number_key"
  ON "xray_report_versions"("report_id", "version_number");
CREATE INDEX "xray_report_versions_organization_id_report_id_idx"
  ON "xray_report_versions"("organization_id", "report_id");
CREATE INDEX "report_approvals_organization_id_report_id_idx"
  ON "report_approvals"("organization_id", "report_id");
CREATE INDEX "report_access_events_organization_id_report_id_idx"
  ON "report_access_events"("organization_id", "report_id");

-- Foreign keys
ALTER TABLE "financial_metadata_reviews"
  ADD CONSTRAINT "financial_metadata_reviews_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_metadata_reviews"
  ADD CONSTRAINT "financial_metadata_reviews_financial_statement_id_fkey"
  FOREIGN KEY ("financial_statement_id") REFERENCES "financial_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_metadata_reviews"
  ADD CONSTRAINT "financial_metadata_reviews_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "diagnostic_readiness_assessments"
  ADD CONSTRAINT "diagnostic_readiness_assessments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "diagnostic_readiness_assessments"
  ADD CONSTRAINT "diagnostic_readiness_assessments_diagnostic_run_id_fkey"
  FOREIGN KEY ("diagnostic_run_id") REFERENCES "diagnostic_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evidence_reconciliations"
  ADD CONSTRAINT "evidence_reconciliations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence_reconciliations"
  ADD CONSTRAINT "evidence_reconciliations_diagnostic_run_id_fkey"
  FOREIGN KEY ("diagnostic_run_id") REFERENCES "diagnostic_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evidence_reconciliations"
  ADD CONSTRAINT "evidence_reconciliations_resolved_by_user_id_fkey"
  FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evidence_reconciliation_items"
  ADD CONSTRAINT "evidence_reconciliation_items_reconciliation_id_fkey"
  FOREIGN KEY ("reconciliation_id") REFERENCES "evidence_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_interpretation_runs"
  ADD CONSTRAINT "ai_interpretation_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_interpretation_runs"
  ADD CONSTRAINT "ai_interpretation_runs_diagnostic_run_id_fkey"
  FOREIGN KEY ("diagnostic_run_id") REFERENCES "diagnostic_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_interpretation_runs"
  ADD CONSTRAINT "ai_interpretation_runs_initiated_by_user_id_fkey"
  FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_interpretation_versions"
  ADD CONSTRAINT "ai_interpretation_versions_ai_interpretation_run_id_fkey"
  FOREIGN KEY ("ai_interpretation_run_id") REFERENCES "ai_interpretation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_interpretation_versions"
  ADD CONSTRAINT "ai_interpretation_versions_edited_by_user_id_fkey"
  FOREIGN KEY ("edited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "xray_reports"
  ADD CONSTRAINT "xray_reports_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "xray_reports"
  ADD CONSTRAINT "xray_reports_diagnostic_run_id_fkey"
  FOREIGN KEY ("diagnostic_run_id") REFERENCES "diagnostic_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "xray_reports"
  ADD CONSTRAINT "xray_reports_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "xray_report_versions"
  ADD CONSTRAINT "xray_report_versions_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "xray_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "xray_report_versions"
  ADD CONSTRAINT "xray_report_versions_ai_interpretation_version_id_fkey"
  FOREIGN KEY ("ai_interpretation_version_id") REFERENCES "ai_interpretation_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "xray_report_versions"
  ADD CONSTRAINT "xray_report_versions_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "xray_reports"
  ADD CONSTRAINT "xray_reports_current_version_id_fkey"
  FOREIGN KEY ("current_version_id") REFERENCES "xray_report_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "report_approvals"
  ADD CONSTRAINT "report_approvals_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "xray_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_approvals"
  ADD CONSTRAINT "report_approvals_report_version_id_fkey"
  FOREIGN KEY ("report_version_id") REFERENCES "xray_report_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_approvals"
  ADD CONSTRAINT "report_approvals_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "report_access_events"
  ADD CONSTRAINT "report_access_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_access_events"
  ADD CONSTRAINT "report_access_events_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "xray_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_access_events"
  ADD CONSTRAINT "report_access_events_report_version_id_fkey"
  FOREIGN KEY ("report_version_id") REFERENCES "xray_report_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_access_events"
  ADD CONSTRAINT "report_access_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
