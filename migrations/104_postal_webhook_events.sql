CREATE TABLE IF NOT EXISTS postal_webhook_events (
  occurrence_key text PRIMARY KEY,
  event_name text NULL,
  lifecycle text NOT NULL,
  occurred_at timestamptz NULL,
  received_at timestamptz NOT NULL,
  authenticated boolean NOT NULL DEFAULT false,
  quarantine_reason text NULL CHECK (quarantine_reason IS NULL OR quarantine_reason IN ('UNAUTHENTICATED','UNKNOWN_EVENT_TYPE','MALFORMED')),
  execution_tag_valid boolean NOT NULL DEFAULT false,
  execution_tag text NULL,
  postal_message_id text NULL,
  message_id text NULL,
  recipient text NULL,
  sender text NULL,
  subject_sha256 text NULL CHECK (subject_sha256 IS NULL OR subject_sha256 ~ '^[0-9a-f]{64}$'),
  raw_body_sha256 text NOT NULL CHECK (raw_body_sha256 ~ '^[0-9a-f]{64}$'),
  details_digest text NOT NULL CHECK (details_digest ~ '^[0-9a-f]{64}$'),
  provenance text NOT NULL,
  eligible_for_reconciliation boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_postal_webhook_events_execution_tag
  ON postal_webhook_events(execution_tag, occurred_at ASC)
  WHERE execution_tag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_postal_webhook_events_message_id
  ON postal_webhook_events(message_id, occurred_at ASC)
  WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_postal_webhook_events_postal_message_id
  ON postal_webhook_events(postal_message_id, occurred_at ASC)
  WHERE postal_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION reject_postal_webhook_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'postal_webhook_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS postal_webhook_events_no_update ON postal_webhook_events;
CREATE TRIGGER postal_webhook_events_no_update
BEFORE UPDATE ON postal_webhook_events
FOR EACH ROW EXECUTE FUNCTION reject_postal_webhook_event_mutation();

DROP TRIGGER IF EXISTS postal_webhook_events_no_delete ON postal_webhook_events;
CREATE TRIGGER postal_webhook_events_no_delete
BEFORE DELETE ON postal_webhook_events
FOR EACH ROW EXECUTE FUNCTION reject_postal_webhook_event_mutation();

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES ('104_postal_webhook_events') ON CONFLICT DO NOTHING;
