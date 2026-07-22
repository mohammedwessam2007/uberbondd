BEGIN;

-- Privacy-separated internal record of an inbound message (P1-11). Never touched by generic
-- store writes (see PROTECTED_COLLECTIONS in src/store.mjs). Deliberately holds no raw or
-- redacted From/Subject/body/attachment text -- only keyed (HMAC) dedupe hashes, an encrypted
-- provider reference (needed only if the message must be re-fetched), a normalized
-- classification code, a confidence bucket, and a bounded retention expiry. This table is what
-- src/autonomy-cycle.mjs's classify-and-suppress stage writes to instead of the generally-
-- readable `replies` table for provider-identifying fields.
CREATE TABLE IF NOT EXISTS inbound_work_items (
  id text PRIMARY KEY,
  message_key text NOT NULL,
  account_key text NOT NULL,
  thread_key text,
  encrypted_provider_ref jsonb,
  classification_code text NOT NULL CHECK (classification_code IN ('bounce', 'complaint', 'unsubscribe', 'out-of-office', 'reply', 'unknown')),
  confidence_bucket text NOT NULL CHECK (confidence_bucket IN ('low', 'medium', 'high')),
  prospect_id text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- A given provider message can only ever produce one work item, regardless of how many times a
-- cycle re-polls it -- this is the durable half of the dedupe guarantee (the in-memory
-- classify-and-suppress loop is the other half, for messages seen within the same cycle).
CREATE UNIQUE INDEX IF NOT EXISTS inbound_work_items_message_key_idx
  ON inbound_work_items (message_key);

-- Supports the retention sweep: find everything past its TTL without a full table scan.
CREATE INDEX IF NOT EXISTS inbound_work_items_expires_at_idx
  ON inbound_work_items (expires_at);

INSERT INTO schema_migrations(version) VALUES ('011_inbound_work_items') ON CONFLICT DO NOTHING;
COMMIT;
