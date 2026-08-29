BEGIN;

CREATE TABLE IF NOT EXISTS egress_route_health (
  route_ref text PRIMARY KEY,
  policy_ref text NOT NULL,
  state text NOT NULL DEFAULT 'HEALTHY',
  allowed_purposes jsonb NOT NULL DEFAULT '[]'::jsonb,
  latency_ms integer,
  success_count bigint NOT NULL DEFAULT 0,
  failure_count bigint NOT NULL DEFAULT 0,
  failure_streak integer NOT NULL DEFAULT 0,
  blocked_count bigint NOT NULL DEFAULT 0,
  captcha_count bigint NOT NULL DEFAULT 0,
  last_outcome text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state IN ('HEALTHY','DEGRADED','QUARANTINED','DISABLED'))
);
CREATE INDEX IF NOT EXISTS egress_route_health_state_idx ON egress_route_health(state,observed_at DESC);

CREATE TABLE IF NOT EXISTS prospect_identity_keys (
  identity_kind text NOT NULL,
  identity_digest text NOT NULL,
  canonical_value text NOT NULL,
  prospect_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(identity_kind,identity_digest),
  CHECK(identity_kind IN ('DOMAIN','PHONE','EMAIL'))
);
CREATE INDEX IF NOT EXISTS prospect_identity_keys_prospect_idx ON prospect_identity_keys(prospect_ref);

CREATE TABLE IF NOT EXISTS outbound_contact_guard (
  guard_key text PRIMARY KEY,
  guard_day date NOT NULL,
  channel text NOT NULL,
  offer_ref text NOT NULL,
  campaign_ref text NOT NULL,
  prospect_ref text,
  primary_identity_digest text NOT NULL,
  contact_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbound_contact_guard_lookup_idx ON outbound_contact_guard(primary_identity_digest,guard_day DESC,channel);

CREATE TABLE IF NOT EXISTS billing_webhook_inbox (
  provider_event_key text PRIMARY KEY,
  provider text NOT NULL,
  event_name text NOT NULL,
  object_type text NOT NULL,
  object_id text NOT NULL,
  payload_hash text NOT NULL,
  custom_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'RECEIVED',
  received_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by text,
  canonical_receipt_ref text,
  error_code text,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(status IN ('RECEIVED','CLAIMED','RECONCILED','IGNORED','RETRYABLE','FAILED','UNCERTAIN'))
);
CREATE INDEX IF NOT EXISTS billing_webhook_inbox_claim_idx ON billing_webhook_inbox(status,received_at) WHERE status IN ('RECEIVED','RETRYABLE');
CREATE UNIQUE INDEX IF NOT EXISTS billing_webhook_provider_object_event_idx ON billing_webhook_inbox(provider,event_name,object_type,object_id,payload_hash);

INSERT INTO schema_migrations(version) VALUES ('101_autonomy_operations_hygiene') ON CONFLICT DO NOTHING;
COMMIT;
