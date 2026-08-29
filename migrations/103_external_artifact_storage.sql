BEGIN;

-- Preserve legacy PostgreSQL artifact bytes by default while allowing future
-- private object-backed rows to carry integrity metadata without duplicating
-- the object bytes in PostgreSQL.
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS storage_backend text NOT NULL DEFAULT 'postgres';
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS storage_key text;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS provider_etag text;
ALTER TABLE artifacts ALTER COLUMN content DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artifacts_storage_backend_check') THEN
    ALTER TABLE artifacts ADD CONSTRAINT artifacts_storage_backend_check
      CHECK (storage_backend IN ('postgres', 'object'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artifacts_storage_shape_check') THEN
    ALTER TABLE artifacts ADD CONSTRAINT artifacts_storage_shape_check CHECK (
      (storage_backend = 'postgres' AND content IS NOT NULL AND storage_key IS NULL AND provider_etag IS NULL)
      OR
      (storage_backend = 'object' AND content IS NULL AND storage_key IS NOT NULL)
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS artifacts_object_storage_key_uidx
  ON artifacts(storage_key)
  WHERE storage_backend = 'object' AND storage_key IS NOT NULL;

INSERT INTO schema_migrations(version)
VALUES ('103_external_artifact_storage')
ON CONFLICT DO NOTHING;

COMMIT;
