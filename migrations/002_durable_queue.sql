BEGIN;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS queue text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS run_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS locked_by text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS singleton_key text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS result jsonb;

UPDATE jobs
SET queue = COALESCE(queue, type, 'legacy'),
    run_at = COALESCE(run_at, scheduled_at, created_at, now())
WHERE queue IS NULL OR run_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_dedupe_unique
  ON jobs(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_singleton_active_unique
  ON jobs(singleton_key)
  WHERE singleton_key IS NOT NULL AND status IN ('queued', 'retry', 'active');
CREATE INDEX IF NOT EXISTS jobs_claim_idx
  ON jobs(status, run_at, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS jobs_locked_idx
  ON jobs(status, locked_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS jobs_dead_letter_idx
  ON jobs(dead_lettered_at DESC) WHERE status = 'dead-letter';

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  id text PRIMARY KEY,
  role text NOT NULL DEFAULT 'worker',
  hostname text,
  pid integer,
  version text,
  started_at timestamptz,
  heartbeat_at timestamptz NOT NULL,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS worker_heartbeats_recent_idx ON worker_heartbeats(heartbeat_at DESC);

INSERT INTO schema_migrations(version) VALUES ('002_durable_queue') ON CONFLICT DO NOTHING;
COMMIT;
