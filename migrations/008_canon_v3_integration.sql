BEGIN;

-- UberBond Canon/V3 integration (P0-006): the master acquisition gate
-- (ACQUISITION_WORKERS_ACTIVE) alone is a single boolean an operator config mistake can flip for
-- everything at once. Every batch that is actually allowed to reach dispatch must additionally
-- name itself: the exact experiment, an idempotent hash of its exact recipient set, the exact
-- sender set, a hard maximum count, an expiry, and the policy version it was approved against.
-- campaign-activation.mjs requires BOTH the global flag AND a matching, unexpired row here before
-- any send-eligibility check can pass; neither alone is sufficient (premerge audit P0-006
-- acceptance test).
CREATE TABLE IF NOT EXISTS campaign_activation_approvals (
  id text PRIMARY KEY,
  experiment_id text REFERENCES experiments(id) ON DELETE CASCADE,
  batch_hash text NOT NULL,
  recipients_hash text NOT NULL,
  sender_set text[] NOT NULL DEFAULT ARRAY[]::text[],
  max_count integer NOT NULL CHECK (max_count > 0),
  policy_version text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_activation_approvals_batch_unique
  ON campaign_activation_approvals(experiment_id, batch_hash);
CREATE INDEX IF NOT EXISTS campaign_activation_approvals_expiry_idx
  ON campaign_activation_approvals(expires_at);

-- P1-010: model/infrastructure cost must be reserved atomically in a durable ledger before any
-- external call, not accumulated in a process-local counter that concurrent workers or a restart
-- can double-spend past. Mirrors migrations/002's discovery-capacity reservation pattern (one row
-- per ledger_date+category, atomically incremented under an advisory lock in
-- store.mjs#reserveCostBudget).
CREATE TABLE IF NOT EXISTS cost_ledger_entries (
  id text PRIMARY KEY,
  ledger_date date NOT NULL,
  category text NOT NULL,
  reserved_cents bigint NOT NULL DEFAULT 0 CHECK (reserved_cents >= 0),
  budget_cents bigint NOT NULL CHECK (budget_cents >= 0),
  cycle_run_id text,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS cost_ledger_entries_date_category_unique
  ON cost_ledger_entries(ledger_date, category);

-- P1-004: a raw evidence count cannot distinguish three independent sources from three mirrors of
-- one vendor's press release. source_family (the publishing organization's stable identity, e.g.
-- an official domain/vendor id) and claim_origin (the underlying claim's own identity, so two
-- pages restating the same claim never count twice) let evidence-independence be enforced by
-- policy rather than by count alone.
ALTER TABLE source_evidence ADD COLUMN IF NOT EXISTS source_family text;
ALTER TABLE source_evidence ADD COLUMN IF NOT EXISTS claim_origin text;
ALTER TABLE source_evidence ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;
ALTER TABLE source_evidence ADD COLUMN IF NOT EXISTS pre_send_verified_at timestamptz;

INSERT INTO schema_migrations(version)
VALUES ('008_canon_v3_integration')
ON CONFLICT DO NOTHING;

COMMIT;
