-- CreateEnum
CREATE TYPE "DocumentFormat" AS ENUM ('PDF', 'XLSX', 'CSV');

-- CreateEnum
CREATE TYPE "DocumentProcessingStatus" AS ENUM ('UPLOADED', 'QUARANTINED', 'SCANNING', 'SCANNED', 'EXTRACTING', 'EXTRACTED', 'REVIEW_REQUIRED', 'READY', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'ERROR', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "DocumentExtractionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'MANUAL_REQUIRED');

-- CreateEnum
CREATE TYPE "DocumentDeletionStatus" AS ENUM ('ACTIVE', 'PENDING_DELETE', 'DELETED');

-- CreateEnum
CREATE TYPE "FailureClass" AS ENUM ('VALIDATION', 'MALWARE', 'SCANNER_UNAVAILABLE', 'PARSER', 'TIMEOUT', 'STORAGE', 'INTERNAL', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "StatementType" AS ENUM ('INCOME_STATEMENT', 'BALANCE_SHEET', 'CASH_FLOW', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "UnitScale" AS ENUM ('ACTUAL', 'THOUSANDS', 'MILLIONS');

-- CreateEnum
CREATE TYPE "FinancialConcept" AS ENUM ('REVENUE', 'COST_OF_GOODS_SOLD', 'GROSS_PROFIT', 'OPERATING_EXPENSES', 'OPERATING_PROFIT', 'NET_PROFIT', 'CASH_AND_EQUIVALENTS', 'ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE', 'CURRENT_ASSETS', 'CURRENT_LIABILITIES', 'TOTAL_ASSETS', 'TOTAL_LIABILITIES', 'EQUITY', 'OPERATING_CASH_FLOW', 'UNMAPPED');

-- CreateEnum
CREATE TYPE "ExtractionQuality" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'MANUAL');

-- CreateEnum
CREATE TYPE "LineItemReviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CORRECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('CONFIRM', 'CORRECT', 'REJECT');

-- CreateEnum
CREATE TYPE "DocumentAccessAction" AS ENUM ('VIEW', 'DOWNLOAD', 'DELETE', 'UPLOAD', 'REVIEW');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "format" "DocumentFormat" NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "quarantine_key" TEXT,
    "processing_status" "DocumentProcessingStatus" NOT NULL DEFAULT 'UPLOADED',
    "scan_status" "DocumentScanStatus" NOT NULL DEFAULT 'PENDING',
    "extraction_status" "DocumentExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "failure_class" "FailureClass",
    "failure_message" TEXT,
    "deletion_status" "DocumentDeletionStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleted_at" TIMESTAMP(3),
    "retention_until" TIMESTAMP(3),
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "format" "DocumentFormat" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_uploads" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "document_id" UUID,
    "declared_filename" TEXT NOT NULL,
    "declared_mime_type" TEXT,
    "declared_format" "DocumentFormat" NOT NULL,
    "expected_byte_size" BIGINT,
    "quarantine_key" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "completed_sha256" TEXT,
    "completed_byte_size" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_processing_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "bull_job_id" TEXT,
    "status" "DocumentProcessingStatus" NOT NULL DEFAULT 'QUARANTINED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "correlation_id" TEXT,
    "actor_user_id" UUID,
    "error_class" "FailureClass",
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_extractions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "quality" "ExtractionQuality" NOT NULL DEFAULT 'MEDIUM',
    "status" "DocumentExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "warnings" JSONB,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_statements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "extraction_id" UUID NOT NULL,
    "statement_type" "StatementType" NOT NULL,
    "currency" TEXT,
    "unit_scale" "UnitScale" NOT NULL DEFAULT 'ACTUAL',
    "period_start" DATE,
    "period_end" DATE,
    "period_label" TEXT,
    "review_status" "LineItemReviewStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_line_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "statement_id" UUID NOT NULL,
    "concept" "FinancialConcept" NOT NULL,
    "label_raw" TEXT NOT NULL,
    "raw_value" TEXT NOT NULL,
    "normalized_value" TEXT,
    "currency" TEXT,
    "unit_scale" "UnitScale" NOT NULL DEFAULT 'ACTUAL',
    "extraction_method" TEXT NOT NULL,
    "quality" "ExtractionQuality" NOT NULL DEFAULT 'MEDIUM',
    "review_status" "LineItemReviewStatus" NOT NULL DEFAULT 'PENDING',
    "evidence_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_references" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "evidence_key" TEXT NOT NULL,
    "page_number" INTEGER,
    "sheet_name" TEXT,
    "cell_ref" TEXT,
    "row_index" INTEGER,
    "column_index" INTEGER,
    "snippet" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "line_item_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" "ReviewAction" NOT NULL,
    "previous_value" TEXT,
    "new_value" TEXT,
    "previous_concept" "FinancialConcept",
    "new_concept" "FinancialConcept",
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extraction_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_access_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" "DocumentAccessAction" NOT NULL,
    "request_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_organization_id_uploaded_at_idx" ON "documents"("organization_id", "uploaded_at");

-- CreateIndex
CREATE INDEX "documents_organization_id_processing_status_idx" ON "documents"("organization_id", "processing_status");

-- CreateIndex
CREATE INDEX "documents_organization_id_deletion_status_idx" ON "documents"("organization_id", "deletion_status");

-- CreateIndex
CREATE UNIQUE INDEX "documents_organization_id_sha256_key" ON "documents"("organization_id", "sha256");

-- CreateIndex
CREATE INDEX "document_versions_organization_id_document_id_idx" ON "document_versions"("organization_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");

-- CreateIndex
CREATE INDEX "document_uploads_organization_id_created_at_idx" ON "document_uploads"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "document_uploads_organization_id_expires_at_idx" ON "document_uploads"("organization_id", "expires_at");

-- CreateIndex
CREATE INDEX "document_processing_jobs_organization_id_document_id_idx" ON "document_processing_jobs"("organization_id", "document_id");

-- CreateIndex
CREATE INDEX "document_processing_jobs_status_created_at_idx" ON "document_processing_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "document_processing_jobs_correlation_id_idx" ON "document_processing_jobs"("correlation_id");

-- CreateIndex
CREATE INDEX "document_extractions_organization_id_document_id_idx" ON "document_extractions"("organization_id", "document_id");

-- CreateIndex
CREATE INDEX "financial_statements_organization_id_document_id_idx" ON "financial_statements"("organization_id", "document_id");

-- CreateIndex
CREATE INDEX "financial_statements_extraction_id_idx" ON "financial_statements"("extraction_id");

-- CreateIndex
CREATE INDEX "financial_line_items_organization_id_statement_id_idx" ON "financial_line_items"("organization_id", "statement_id");

-- CreateIndex
CREATE INDEX "financial_line_items_concept_idx" ON "financial_line_items"("concept");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_references_evidence_key_key" ON "evidence_references"("evidence_key");

-- CreateIndex
CREATE INDEX "evidence_references_organization_id_document_id_idx" ON "evidence_references"("organization_id", "document_id");

-- CreateIndex
CREATE INDEX "extraction_reviews_organization_id_line_item_id_idx" ON "extraction_reviews"("organization_id", "line_item_id");

-- CreateIndex
CREATE INDEX "extraction_reviews_actor_user_id_idx" ON "extraction_reviews"("actor_user_id");

-- CreateIndex
CREATE INDEX "document_access_events_organization_id_document_id_created__idx" ON "document_access_events"("organization_id", "document_id", "created_at");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_processing_jobs" ADD CONSTRAINT "document_processing_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_processing_jobs" ADD CONSTRAINT "document_processing_jobs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_extraction_id_fkey" FOREIGN KEY ("extraction_id") REFERENCES "document_extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_line_items" ADD CONSTRAINT "financial_line_items_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "financial_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_line_items" ADD CONSTRAINT "financial_line_items_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_reviews" ADD CONSTRAINT "extraction_reviews_line_item_id_fkey" FOREIGN KEY ("line_item_id") REFERENCES "financial_line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_reviews" ADD CONSTRAINT "extraction_reviews_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_events" ADD CONSTRAINT "document_access_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_events" ADD CONSTRAINT "document_access_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_events" ADD CONSTRAINT "document_access_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
