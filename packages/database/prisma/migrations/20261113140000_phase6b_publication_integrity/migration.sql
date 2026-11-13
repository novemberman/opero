-- Phase 6B: published report PDF artifacts are immutable once hashed.

CREATE OR REPLACE FUNCTION prevent_published_report_artifact_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('PUBLISHED', 'SUPERSEDED')
     AND OLD.content_hash IS NOT NULL THEN
    IF NEW.storage_key IS DISTINCT FROM OLD.storage_key
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
       OR NEW.snapshot_payload IS DISTINCT FROM OLD.snapshot_payload THEN
      RAISE EXCEPTION 'Published report artifacts are immutable'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS xray_report_versions_immutable_artifacts ON "xray_report_versions";

CREATE TRIGGER xray_report_versions_immutable_artifacts
  BEFORE UPDATE ON "xray_report_versions"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_published_report_artifact_mutation();
