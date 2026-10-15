BEGIN;

-- Inbound IMAP replies that do not match a prospect are kept here for manual routing instead of
-- being dropped while the account cursor advances past them. Additive only: no existing table changes.
CREATE TABLE IF NOT EXISTS unlinked_replies (
  id text PRIMARY KEY,
  account_slot text,
  received_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS unlinked_replies_received_idx ON unlinked_replies(received_at DESC);

INSERT INTO schema_migrations(version)
VALUES ('20261013_unlinked_replies')
ON CONFLICT DO NOTHING;
COMMIT;
