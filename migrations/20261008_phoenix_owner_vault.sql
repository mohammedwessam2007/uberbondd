-- Durable first-party PHOENIX continuity records. Owner-authenticated access only.
-- Append-only by ID; no deletion path or customer-facing publication.
CREATE TABLE IF NOT EXISTS phoenix_capsules (
  id text PRIMARY KEY,
  session_id text NOT NULL,
  digest text NOT NULL UNIQUE,
  entry_count integer NOT NULL CHECK (entry_count BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS phoenix_capsules_recent_idx ON phoenix_capsules (created_at DESC);
