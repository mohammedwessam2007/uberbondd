-- UberBond Cost -> Stage -> Fulfill -> Learn support tables.
-- These tables contain internal refs/normalized content only and grant no external authority.

CREATE TABLE IF NOT EXISTS public_evidence_cache (
  cache_key TEXT PRIMARY KEY,
  target_ref TEXT NOT NULL,
  field TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_policy_ref TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_evidence_cache_lookup_idx ON public_evidence_cache(target_ref, field, expires_at DESC);

CREATE TABLE IF NOT EXISTS staged_content_repository (
  content_id TEXT PRIMARY KEY,
  content_ref TEXT NOT NULL UNIQUE,
  asset_type TEXT NOT NULL,
  audience_ref TEXT NOT NULL,
  offer_ref TEXT NOT NULL,
  profile_ref TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  source_evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  policy_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY',
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('READY','CLAIMED','CONSUMED','FAILED','EXPIRED','SUPERSEDED'))
);
CREATE INDEX IF NOT EXISTS staged_content_ready_idx ON staged_content_repository(status, available_at, expires_at);

CREATE TABLE IF NOT EXISTS fulfillment_provisioning_runs (
  plan_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  payment_event_ref TEXT NOT NULL,
  payment_receipt_ref TEXT NOT NULL,
  fulfillment_ref TEXT NOT NULL,
  customer_ref TEXT NOT NULL,
  service_sku_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PREPARED',
  action_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider_receipt_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('PREPARED','RUNNING','SUCCEEDED','FAILED','UNCERTAIN','CANCELLED'))
);

CREATE TABLE IF NOT EXISTS economic_profile_weights (
  profile_key TEXT PRIMARY KEY,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  weight DOUBLE PRECISION NOT NULL DEFAULT 1.0 CHECK(weight>0),
  exposures INTEGER NOT NULL DEFAULT 0 CHECK(exposures>=0),
  qualified_outcomes INTEGER NOT NULL DEFAULT 0 CHECK(qualified_outcomes>=0),
  paid_accepted_outcomes INTEGER NOT NULL DEFAULT 0 CHECK(paid_accepted_outcomes>=0),
  cleared_contribution_cents BIGINT,
  founder_minutes DOUBLE PRECISION,
  policy_version TEXT NOT NULL,
  proposal_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);