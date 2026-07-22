BEGIN;

ALTER TABLE autonomy_cycle_runs
  ADD COLUMN IF NOT EXISTS lease_epoch bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempt_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS terminal_reason text;

ALTER TABLE autonomy_cycle_runs
  DROP CONSTRAINT IF EXISTS autonomy_terminal_reason_len;
ALTER TABLE autonomy_cycle_runs
  ADD CONSTRAINT autonomy_terminal_reason_len
  CHECK (terminal_reason IS NULL OR length(terminal_reason) <= 80);

INSERT INTO schema_migrations(version) VALUES ('009_autonomy_cycle_lease_epoch') ON CONFLICT DO NOTHING;
COMMIT;
