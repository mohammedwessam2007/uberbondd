CREATE TABLE IF NOT EXISTS omnia_v9_execution_receipt_bindings (
  reservation_id text PRIMARY KEY,
  receipt_digest text NOT NULL UNIQUE CHECK (receipt_digest ~ '^[0-9a-f]{64}$'),
  tenant_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('PROVIDER_ACCEPTED','PROVIDER_RESULT_UNCERTAIN')),
  pre_effect_context_digest text NOT NULL CHECK (pre_effect_context_digest ~ '^[0-9a-f]{64}$'),
  pre_effect_observation_digest text NOT NULL CHECK (pre_effect_observation_digest ~ '^[0-9a-f]{64}$'),
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_omnia_v9_execution_receipt_bindings_tenant_created
  ON omnia_v9_execution_receipt_bindings(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES ('006_omnia_v9_execution_receipt_uniqueness') ON CONFLICT DO NOTHING;
