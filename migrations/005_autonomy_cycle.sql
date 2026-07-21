BEGIN;

CREATE TABLE IF NOT EXISTS autonomy_cycle_runs (
  id text PRIMARY KEY,
  run_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'aborted')),
  version integer NOT NULL DEFAULT 0,
  checkpoint_version integer NOT NULL DEFAULT 1,
  lease_owner text NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  finalized_at timestamptz,
  digest_written_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  stages jsonb NOT NULL DEFAULT '{}'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- The core safety guarantee: Postgres itself refuses to let a second row exist with
-- status = 'active', regardless of run_key. This is what "database-enforced singleton"
-- means in practice — it is not something application code can forget to check.
CREATE UNIQUE INDEX IF NOT EXISTS autonomy_cycle_runs_single_active_idx
  ON autonomy_cycle_runs ((true))
  WHERE status = 'active';

-- Supports finding an active run whose lease has expired (its owning process crashed or
-- stalled) without a full table scan.
CREATE INDEX IF NOT EXISTS autonomy_cycle_runs_stale_lease_idx
  ON autonomy_cycle_runs(lease_expires_at)
  WHERE status = 'active';

INSERT INTO schema_migrations(version) VALUES ('005_autonomy_cycle') ON CONFLICT DO NOTHING;
COMMIT;
