BEGIN;

-- Artifact bytes may remain in Postgres for legacy rows, but new object-backed
-- rows can store only a private object key + integrity metadata.
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS storage_backend text NOT NULL DEFAULT 'postgres';
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS storage_key text;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS provider_etag text;
ALTER TABLE artifacts ALTER COLUMN content DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artifacts_storage_shape_check') THEN
    ALTER TABLE artifacts ADD CONSTRAINT artifacts_storage_shape_check CHECK (
      (storage_backend = 'postgres' AND content IS NOT NULL AND storage_key IS NULL)
      OR
      (storage_backend = 'object' AND content IS NULL AND storage_key IS NOT NULL)
    );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS artifacts_storage_key_idx ON artifacts(storage_backend, storage_key) WHERE storage_key IS NOT NULL;

-- Reconciliation claims are leases, not irreversible ownership. These fields
-- allow a later worker to recover a crashed claim without blindly unlocking.
ALTER TABLE billing_webhook_inbox ADD COLUMN IF NOT EXISTS claim_attempts integer NOT NULL DEFAULT 0 CHECK (claim_attempts >= 0);
ALTER TABLE billing_webhook_inbox ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE billing_webhook_inbox ADD COLUMN IF NOT EXISTS last_error_at timestamptz;
CREATE INDEX IF NOT EXISTS billing_webhook_retry_due_idx
  ON billing_webhook_inbox(status, next_attempt_at, claimed_at)
  WHERE status IN ('RECEIVED','RETRYABLE','CLAIMED','UNCERTAIN');

INSERT INTO schema_migrations(version) VALUES ('102_runtime_resilience_and_external_artifacts') ON CONFLICT DO NOTHING;
COMMIT;
