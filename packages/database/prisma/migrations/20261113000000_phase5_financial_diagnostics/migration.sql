-- AlterEnum FinancialConcept
ALTER TYPE "FinancialConcept" ADD VALUE 'INVENTORY';
ALTER TYPE "FinancialConcept" ADD VALUE 'INTEREST_BEARING_DEBT';
ALTER TYPE "FinancialConcept" ADD VALUE 'INTEREST_EXPENSE';
ALTER TYPE "FinancialConcept" ADD VALUE 'CAPITAL_EXPENDITURE';

-- CreateEnum
CREATE TYPE "DiagnosticRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "DiagnosticMetricStatus" AS ENUM ('COMPUTED', 'UNDEFINED', 'INSUFFICIENT_INPUTS', 'INCOMPATIBLE');
CREATE TYPE "DiagnosticScoreStatus" AS ENUM ('SCORED', 'INSUFFICIENT_DATA');
CREATE TYPE "DiagnosticFindingSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "DiagnosticFindingCategory" AS ENUM ('OBSERVATION', 'RISK', 'INVESTIGATION', 'DATA_QUALITY');
CREATE TYPE "DiagnosticFindingReviewStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'DISMISSED');
CREATE TYPE "DiagnosticReviewAction" AS ENUM ('ACKNOWLEDGE', 'DISMISS');

-- CreateTable
CREATE TABLE "diagnostic_rule_versions" (
    "id" UUID NOT NULL,
    "rule_set_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "DiagnosticFindingCategory" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_rule_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "diagnostic_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "initiated_by_user_id" UUID NOT NULL,
    "status" "DiagnosticRunStatus" NOT NULL DEFAULT 'QUEUED',
    "currency" TEXT,
    "period_start" DATE,
    "period_end" DATE,
    "period_label" TEXT,
    "calculation_engine_version" TEXT NOT NULL,
    "rule_set_version" TEXT NOT NULL,
    "score_methodology_version" TEXT NOT NULL,
    "failure_class" "FailureClass",
    "failure_message" TEXT,
    "bull_job_id" TEXT,
    "request_id" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnostic_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "diagnostic_input_snapshots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "diagnostic_run_id" UUID NOT NULL,
    "content_hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "document_ids" UUID[],
    "extraction_ids" UUID[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_input_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "financial_metrics" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "diagnostic_run_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "status" "DiagnosticMetricStatus" NOT NULL,
    "value" TEXT,
    "unit" TEXT,
    "formula_id" TEXT NOT NULL,
    "period_start" DATE,
    "period_end" DATE,
    "period_label" TEXT,
    "input_refs" JSONB,
    "warnings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_metrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_quality_assessments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "diagnostic_run_id" UUID NOT NULL,
    "completeness" TEXT NOT NULL,
    "consistency" TEXT NOT NULL,
    "evidence_reliability" TEXT NOT NULL,
    "diagnostic_coverage" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_quality_assessments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "diagnostic_scores" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "diagnostic_run_id" UUID NOT NULL,
    "status" "DiagnosticScoreStatus" NOT NULL,
    "overall_score" INTEGER,
    "methodology_version" TEXT NOT NULL,
    "limitations" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_scores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "score_components" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "diagnostic_score_id" UUID NOT NULL,
    "dimension" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "included" BOOLEAN NOT NULL,
    "score" INTEGER,
    "exclusion_reason" TEXT,
    "metric_codes" TEXT[],

    CONSTRAINT "score_components_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "diagnostic_findings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "diagnostic_run_id" UUID NOT NULL,
    "rule_version_id" UUID,
    "rule_id" TEXT NOT NULL,
    "rule_set_version" TEXT NOT NULL,
    "category" "DiagnosticFindingCategory" NOT NULL,
    "severity" "DiagnosticFindingSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "implication" TEXT NOT NULL,
    "suggested_action" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "supporting_metrics" TEXT[],
    "review_status" "DiagnosticFindingReviewStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_findings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "diagnostic_evidence_links" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "finding_id" UUID NOT NULL,
    "document_id" UUID,
    "line_item_id" UUID,
    "evidence_reference_id" UUID,
    "snapshot_key" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "diagnostic_evidence_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "diagnostic_reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "diagnostic_run_id" UUID NOT NULL,
    "finding_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "action" "DiagnosticReviewAction" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_reviews_pkey" PRIMARY KEY ("id")
);

-- Indexes / uniques
CREATE UNIQUE INDEX "diagnostic_rule_versions_rule_set_id_rule_id_version_key" ON "diagnostic_rule_versions"("rule_set_id", "rule_id", "version");
CREATE INDEX "diagnostic_rule_versions_rule_set_id_version_idx" ON "diagnostic_rule_versions"("rule_set_id", "version");

CREATE INDEX "diagnostic_runs_organization_id_created_at_idx" ON "diagnostic_runs"("organization_id", "created_at");
CREATE INDEX "diagnostic_runs_organization_id_status_idx" ON "diagnostic_runs"("organization_id", "status");

CREATE UNIQUE INDEX "diagnostic_input_snapshots_diagnostic_run_id_key" ON "diagnostic_input_snapshots"("diagnostic_run_id");
CREATE INDEX "diagnostic_input_snapshots_organization_id_idx" ON "diagnostic_input_snapshots"("organization_id");

CREATE INDEX "financial_metrics_organization_id_diagnostic_run_id_idx" ON "financial_metrics"("organization_id", "diagnostic_run_id");
CREATE INDEX "financial_metrics_diagnostic_run_id_code_idx" ON "financial_metrics"("diagnostic_run_id", "code");

CREATE UNIQUE INDEX "data_quality_assessments_diagnostic_run_id_key" ON "data_quality_assessments"("diagnostic_run_id");
CREATE INDEX "data_quality_assessments_organization_id_idx" ON "data_quality_assessments"("organization_id");

CREATE UNIQUE INDEX "diagnostic_scores_diagnostic_run_id_key" ON "diagnostic_scores"("diagnostic_run_id");
CREATE INDEX "diagnostic_scores_organization_id_idx" ON "diagnostic_scores"("organization_id");

CREATE INDEX "score_components_organization_id_diagnostic_score_id_idx" ON "score_components"("organization_id", "diagnostic_score_id");

CREATE INDEX "diagnostic_findings_organization_id_diagnostic_run_id_idx" ON "diagnostic_findings"("organization_id", "diagnostic_run_id");
CREATE INDEX "diagnostic_findings_diagnostic_run_id_rule_id_idx" ON "diagnostic_findings"("diagnostic_run_id", "rule_id");

CREATE INDEX "diagnostic_evidence_links_organization_id_finding_id_idx" ON "diagnostic_evidence_links"("organization_id", "finding_id");

CREATE INDEX "diagnostic_reviews_organization_id_diagnostic_run_id_idx" ON "diagnostic_reviews"("organization_id", "diagnostic_run_id");

-- ForeignKeys
ALTER TABLE "diagnostic_runs" ADD CONSTRAINT "diagnostic_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "diagnostic_runs" ADD CONSTRAINT "diagnostic_runs_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "diagnostic_input_snapshots" ADD CONSTRAINT "diagnostic_input_snapshots_diagnostic_run_id_fkey" FOREIGN KEY ("diagnostic_run_id") REFERENCES "diagnostic_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "financial_metrics" ADD CONSTRAINT "financial_metrics_diagnostic_run_id_fkey" FOREIGN KEY ("diagnostic_run_id") REFERENCES "diagnostic_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "data_quality_assessments" ADD CONSTRAINT "data_quality_assessments_diagnostic_run_id_fkey" FOREIGN KEY ("diagnostic_run_id") REFERENCES "diagnostic_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "diagnostic_scores" ADD CONSTRAINT "diagnostic_scores_diagnostic_run_id_fkey" FOREIGN KEY ("diagnostic_run_id") REFERENCES "diagnostic_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "score_components" ADD CONSTRAINT "score_components_diagnostic_score_id_fkey" FOREIGN KEY ("diagnostic_score_id") REFERENCES "diagnostic_scores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "diagnostic_findings" ADD CONSTRAINT "diagnostic_findings_diagnostic_run_id_fkey" FOREIGN KEY ("diagnostic_run_id") REFERENCES "diagnostic_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diagnostic_findings" ADD CONSTRAINT "diagnostic_findings_rule_version_id_fkey" FOREIGN KEY ("rule_version_id") REFERENCES "diagnostic_rule_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "diagnostic_evidence_links" ADD CONSTRAINT "diagnostic_evidence_links_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "diagnostic_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "diagnostic_reviews" ADD CONSTRAINT "diagnostic_reviews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "diagnostic_reviews" ADD CONSTRAINT "diagnostic_reviews_diagnostic_run_id_fkey" FOREIGN KEY ("diagnostic_run_id") REFERENCES "diagnostic_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diagnostic_reviews" ADD CONSTRAINT "diagnostic_reviews_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "diagnostic_findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "diagnostic_reviews" ADD CONSTRAINT "diagnostic_reviews_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
