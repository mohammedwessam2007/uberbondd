BEGIN;

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_idempotency_key_uidx
  ON campaigns(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

INSERT INTO schema_migrations(version) VALUES ('105_campaign_idempotency') ON CONFLICT DO NOTHING;
COMMIT;
