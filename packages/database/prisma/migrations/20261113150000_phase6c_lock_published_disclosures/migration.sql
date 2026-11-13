-- Phase 6C: lock disclosures and approval-critical metadata on published versions.

CREATE OR REPLACE FUNCTION prevent_published_report_artifact_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('PUBLISHED', 'SUPERSEDED')
     AND OLD.content_hash IS NOT NULL THEN
    IF NEW.storage_key IS DISTINCT FROM OLD.storage_key
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
       OR NEW.snapshot_payload IS DISTINCT FROM OLD.snapshot_payload
       OR NEW.disclosures IS DISTINCT FROM OLD.disclosures
       OR NEW.ai_interpretation_version_id IS DISTINCT FROM OLD.ai_interpretation_version_id
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.report_id IS DISTINCT FROM OLD.report_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
      RAISE EXCEPTION 'Published report artifacts and disclosures are immutable'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  -- Status may move PUBLISHED → SUPERSEDED only; never reverse or jump elsewhere.
  IF OLD.status = 'PUBLISHED' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status <> 'SUPERSEDED' THEN
      RAISE EXCEPTION 'Published report status may only move to SUPERSEDED'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  IF OLD.status = 'SUPERSEDED' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Superseded report versions are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
