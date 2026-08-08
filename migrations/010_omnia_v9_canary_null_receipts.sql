-- Durable receipts for the zero-consequence canary's null sink. Deliberately
-- separate from the frozen P5-P9 execution-receipt machinery (which is
-- shaped around a real Gmail pre/post-effect boundary with
-- preEffectContextDigest/preEffectObservationDigest fields that do not
-- naturally exist for a null-sink action) -- this is a smaller, additive,
-- non-frozen table providing exactly the properties this mission's
-- double-spend/idempotency/contradiction drills need: one receipt per
-- reservation, and any attempt to bind a second, different receipt or
-- authorization to the same reservation is a detectable conflict, not a
-- silent overwrite.
CREATE TABLE IF NOT EXISTS omnia_v9_canary_null_receipts (
  reservation_id text PRIMARY KEY,
  intent_digest text NOT NULL CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
  authorization_digest text NOT NULL,
  tenant_id text NOT NULL,
  action_class text NOT NULL,
  result text NOT NULL CHECK (result = 'NULL_SINK_ACCEPTED'),
  receipt_digest text NOT NULL CHECK (receipt_digest ~ '^[0-9a-f]{64}$'),
  attempted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_omnia_v9_canary_null_receipts_tenant
  ON omnia_v9_canary_null_receipts(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES ('010_omnia_v9_canary_null_receipts') ON CONFLICT DO NOTHING;
