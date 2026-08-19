CREATE TABLE IF NOT EXISTS omnia_v9_objects (
  object_type text NOT NULL,
  object_id text NOT NULL,
  tenant_id text NOT NULL,
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (object_type, object_id),
  UNIQUE (object_type, digest)
);

CREATE INDEX IF NOT EXISTS idx_omnia_v9_objects_tenant_type_created
  ON omnia_v9_objects(tenant_id, object_type, created_at DESC);

CREATE TABLE IF NOT EXISTS omnia_v9_revocations (
  target_type text NOT NULL,
  target_id text NOT NULL,
  revocation_id text NOT NULL,
  tenant_id text NOT NULL,
  reason text NOT NULL,
  evidence_digest text NULL CHECK (evidence_digest IS NULL OR evidence_digest ~ '^[0-9a-f]{64}$'),
  revoked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_type, target_id),
  UNIQUE (revocation_id)
);

CREATE INDEX IF NOT EXISTS idx_omnia_v9_revocations_tenant_time
  ON omnia_v9_revocations(tenant_id, revoked_at DESC);

CREATE TABLE IF NOT EXISTS omnia_v9_approval_usage (
  approval_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  cost_usd numeric(18,6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS omnia_v9_authority_reservations (
  idempotency_key text PRIMARY KEY,
  intent_digest text NOT NULL CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
  approval_id text NOT NULL,
  tenant_id text NOT NULL,
  use_delta integer NOT NULL DEFAULT 1 CHECK (use_delta > 0),
  cost_delta_usd numeric(18,6) NOT NULL DEFAULT 0 CHECK (cost_delta_usd >= 0),
  blast_radius integer NOT NULL DEFAULT 0 CHECK (blast_radius >= 0),
  status text NOT NULL CHECK (status IN ('PENDING','RESERVED','COMMITTED','UNCERTAIN','RELEASED','DENIED')),
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_omnia_v9_authority_reservations_approval
  ON omnia_v9_authority_reservations(approval_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_omnia_v9_authority_reservations_tenant_status
  ON omnia_v9_authority_reservations(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES ('005_omnia_v9_proof_store') ON CONFLICT DO NOTHING;
