BEGIN;

CREATE TABLE IF NOT EXISTS source_evidence (
  id text PRIMARY KEY,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  organization_domain text NOT NULL,
  source_url text NOT NULL,
  source_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  contact_email text,
  content_hash text NOT NULL,
  captured_at timestamptz NOT NULL,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS source_evidence_identity_unique
  ON source_evidence(organization_domain, source_url, content_hash);
CREATE INDEX IF NOT EXISTS source_evidence_prospect_idx
  ON source_evidence(prospect_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS source_evidence_expiry_idx
  ON source_evidence(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS source_evidence_contact_idx
  ON source_evidence(lower(contact_email)) WHERE contact_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS experiments (
  id text PRIMARY KEY,
  campaign_id text REFERENCES campaigns(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  hypothesis text NOT NULL,
  lane text NOT NULL,
  variant text NOT NULL,
  minimum_sample integer NOT NULL DEFAULT 25,
  success_metric text NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  decision text,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS experiments_status_lane_idx
  ON experiments(status, lane, created_at DESC);

CREATE TABLE IF NOT EXISTS opportunities (
  id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  campaign_id text REFERENCES campaigns(id) ON DELETE SET NULL,
  source_evidence_id text REFERENCES source_evidence(id) ON DELETE SET NULL,
  experiment_id text REFERENCES experiments(id) ON DELETE SET NULL,
  stage text NOT NULL DEFAULT 'discovered',
  service_lane text NOT NULL,
  geography text,
  expected_value_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  probability_bps integer NOT NULL DEFAULT 0 CHECK (probability_bps BETWEEN 0 AND 10000),
  owner_minutes integer NOT NULL DEFAULT 0 CHECK (owner_minutes >= 0),
  delivery_hours numeric(10,2) NOT NULL DEFAULT 0 CHECK (delivery_hours >= 0),
  score_total numeric(6,2),
  score_version text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS opportunities_stage_score_idx
  ON opportunities(stage, score_total DESC NULLS LAST, created_at ASC);
CREATE INDEX IF NOT EXISTS opportunities_prospect_idx
  ON opportunities(prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS opportunities_expiry_idx
  ON opportunities(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS policy_decisions (
  id text PRIMARY KEY,
  opportunity_id text REFERENCES opportunities(id) ON DELETE CASCADE,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  policy_version text NOT NULL,
  decision text NOT NULL,
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  evaluated_at timestamptz NOT NULL,
  created_at timestamptz,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS policy_decisions_opportunity_idx
  ON policy_decisions(opportunity_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS policy_decisions_decision_idx
  ON policy_decisions(decision, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS message_variants (
  id text PRIMARY KEY,
  campaign_id text REFERENCES campaigns(id) ON DELETE SET NULL,
  experiment_id text REFERENCES experiments(id) ON DELETE SET NULL,
  lane text NOT NULL,
  subject text NOT NULL,
  body_hash text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

-- campaign_id and experiment_id are nullable FKs; a plain composite UNIQUE INDEX never fires for
-- two rows that are both NULL in the same column (Postgres treats every NULL as distinct from
-- every other NULL), so a bare (campaign_id, experiment_id, body_hash) index would silently allow
-- duplicate variants not yet tied to a campaign/experiment. COALESCE to an empty-string sentinel
-- so NULL collapses to one comparable value and duplicates are actually rejected.
CREATE UNIQUE INDEX IF NOT EXISTS message_variants_identity_unique
  ON message_variants(COALESCE(campaign_id, ''), COALESCE(experiment_id, ''), body_hash);

CREATE TABLE IF NOT EXISTS owner_gates (
  id text PRIMARY KEY,
  opportunity_id text REFERENCES opportunities(id) ON DELETE SET NULL,
  gate_type text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  expected_value_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  owner_minutes integer NOT NULL DEFAULT 0 CHECK (owner_minutes >= 0),
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS owner_gates_status_value_idx
  ON owner_gates(status, expected_value_cents DESC, owner_minutes ASC);
CREATE INDEX IF NOT EXISTS owner_gates_expiry_idx
  ON owner_gates(expires_at) WHERE expires_at IS NOT NULL;

INSERT INTO schema_migrations(version)
VALUES ('005_revenue_os_control_plane')
ON CONFLICT DO NOTHING;

COMMIT;
