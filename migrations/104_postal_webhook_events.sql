BEGIN;

-- Independent evidence about what Postal actually did with a message.
--
-- Append-only in practice and replay-safe by construction: occurrence_key is
-- the provider's own event uuid where it supplies one and a digest of the exact
-- raw body where it does not, so a redelivered webhook lands on ON CONFLICT DO
-- NOTHING rather than becoming a second observation of one event.
--
-- What is deliberately absent: the raw body, and the per-recipient token Postal
-- returns. The token is a live credential and the body can carry one, so only
-- raw_body_sha256 is kept -- enough to prove which bytes were verified, useless
-- to anyone who reads the table.
CREATE TABLE IF NOT EXISTS postal_webhook_events (
  occurrence_key      text PRIMARY KEY,
  event               text NOT NULL DEFAULT '',
  lifecycle           text NOT NULL,
  postal_message_id   text NOT NULL DEFAULT '',
  message_header_id   text NOT NULL DEFAULT '',
  tag                 text NOT NULL DEFAULT '',
  execution_tag_valid boolean NOT NULL DEFAULT false,
  recipient           text NOT NULL DEFAULT '',
  sender              text NOT NULL DEFAULT '',
  subject_sha256      text NOT NULL DEFAULT '',
  raw_body_sha256     text NOT NULL CHECK (raw_body_sha256 ~ '^[0-9a-f]{64}$'),
  status_detail       text NOT NULL DEFAULT '',
  occurred_at         timestamptz NOT NULL,
  received_at         timestamptz NOT NULL,
  authenticated       boolean NOT NULL DEFAULT false,
  quarantine_reason   text NULL,
  provenance          text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Reconciliation looks a row up by the execution tag the adapter generated, or
-- by the Message-ID header it set. Both are partial: a quarantined row must
-- never be reachable from a reconciliation lookup, so the indexes that serve
-- that lookup do not contain them.
CREATE INDEX IF NOT EXISTS postal_webhook_events_tag_idx
  ON postal_webhook_events(tag, occurred_at DESC)
  WHERE authenticated AND quarantine_reason IS NULL;

CREATE INDEX IF NOT EXISTS postal_webhook_events_message_header_idx
  ON postal_webhook_events(message_header_id, occurred_at DESC)
  WHERE authenticated AND quarantine_reason IS NULL;

CREATE INDEX IF NOT EXISTS postal_webhook_events_received_idx
  ON postal_webhook_events(received_at DESC);

-- Evidence is not editable. A contradictory later observation is another row,
-- and deriveCurrentPostalState decides which one is current; rewriting the
-- earlier one would destroy the contradiction that is itself the signal.
CREATE OR REPLACE FUNCTION postal_webhook_events_reject_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'postal_webhook_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS postal_webhook_events_no_update ON postal_webhook_events;
CREATE TRIGGER postal_webhook_events_no_update
BEFORE UPDATE ON postal_webhook_events
FOR EACH ROW EXECUTE FUNCTION postal_webhook_events_reject_mutation();

DROP TRIGGER IF EXISTS postal_webhook_events_no_delete ON postal_webhook_events;
CREATE TRIGGER postal_webhook_events_no_delete
BEFORE DELETE ON postal_webhook_events
FOR EACH ROW EXECUTE FUNCTION postal_webhook_events_reject_mutation();

INSERT INTO schema_migrations(version) VALUES ('104_postal_webhook_events') ON CONFLICT DO NOTHING;
COMMIT;
