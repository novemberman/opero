-- Phase 8: quantity classification, scale confidence, and processing progress.
-- Backward compatible: existing line items default to MONETARY / UNKNOWN scale confidence.

CREATE TYPE "QuantityClass" AS ENUM (
  'MONETARY',
  'PERCENTAGE',
  'RATIO',
  'DATE',
  'NOTE_NUMBER',
  'SHARE_COUNT',
  'OTHER'
);

CREATE TYPE "ScaleConfidence" AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW',
  'AMBIGUOUS',
  'UNKNOWN'
);

ALTER TABLE "document_processing_jobs"
  ADD COLUMN IF NOT EXISTS "progress" JSONB;

ALTER TABLE "financial_line_items"
  ADD COLUMN IF NOT EXISTS "quantity_class" "QuantityClass" NOT NULL DEFAULT 'MONETARY',
  ADD COLUMN IF NOT EXISTS "scale_confidence" "ScaleConfidence" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS "unit_scale_requires_review" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "financial_line_items_quantity_class_idx"
  ON "financial_line_items"("quantity_class");
