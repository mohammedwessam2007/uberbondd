-- Winnr signature-verified adverse webhook event receipts.
-- Sender authority is never established by this table or any record in it.
-- Suppressions use the existing canonical `suppressions` table in 001_initial.sql.
CREATE TABLE IF NOT EXISTS winnr_webhook_events (
  event_id text PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 240),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 120),
  payload_digest text NOT NULL CHECK (payload_digest ~ '^sha256:[a-f0-9]{64}$'),
  recipient_digest text CHECK (recipient_digest IS NULL OR recipient_digest ~ '^sha256:[a-f0-9]{64}$'),
  action text NOT NULL CHECK (action IN ('RECORDED_NO_SUPPRESSION','SUPPRESSED_RECIPIENT','REPLY_REQUIRES_REVIEW')),
  received_at timestamptz NOT NULL DEFAULT now(),
  provider_occurred_at timestamptz,
  CHECK (action <> 'SUPPRESSED_RECIPIENT' OR recipient_digest IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS winnr_webhook_events_received_idx ON winnr_webhook_events(received_at DESC);
COMMENT ON TABLE winnr_webhook_events IS 'Authenticated Winnr event metadata with replay-idempotent one-way suppression; does not authorize outgoing messages.';
