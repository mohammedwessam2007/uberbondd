BEGIN;

CREATE TABLE IF NOT EXISTS artifacts (
  id text PRIMARY KEY,
  content_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size >= 0),
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  content bytea NOT NULL
);
CREATE INDEX IF NOT EXISTS artifacts_created_idx ON artifacts(created_at DESC);
CREATE INDEX IF NOT EXISTS artifacts_expiry_idx ON artifacts(expires_at) WHERE expires_at IS NOT NULL;

INSERT INTO schema_migrations(version) VALUES ('003_shared_artifacts') ON CONFLICT DO NOTHING;
COMMIT;
