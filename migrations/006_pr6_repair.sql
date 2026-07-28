BEGIN;

-- PR #6 adversarial-audit repair, item 9 / integration gap: partner routes, offers, and rejection
-- records were previously "partially persisted" (schema-validated but only written to the generic
-- audit_log, no queryable table). All three get real, queryable tables here, shaped consistently
-- with source_evidence/opportunities so they can be ranked, queried, and attributed the same way.

CREATE TABLE IF NOT EXISTS partner_routes (
  id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  organization_domain text NOT NULL,
  service_lane text NOT NULL,
  geography text,
  expected_value_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  owner_minutes integer NOT NULL DEFAULT 0 CHECK (owner_minutes >= 0),
  delivery_hours numeric(10,2) NOT NULL DEFAULT 0 CHECK (delivery_hours >= 0),
  source_evidence_id text REFERENCES source_evidence(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS partner_routes_domain_lane_idx
  ON partner_routes(organization_domain, service_lane, created_at DESC);

CREATE TABLE IF NOT EXISTS offers (
  id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  organization_domain text NOT NULL,
  service_lane text NOT NULL,
  geography text,
  expected_value_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  owner_minutes integer NOT NULL DEFAULT 0 CHECK (owner_minutes >= 0),
  delivery_hours numeric(10,2) NOT NULL DEFAULT 0 CHECK (delivery_hours >= 0),
  source_evidence_id text REFERENCES source_evidence(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS offers_domain_lane_idx
  ON offers(organization_domain, service_lane, created_at DESC);

CREATE TABLE IF NOT EXISTS rejections (
  id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  organization_domain text NOT NULL,
  service_lane text NOT NULL,
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  source_evidence_id text REFERENCES source_evidence(id) ON DELETE SET NULL,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS rejections_domain_lane_idx
  ON rejections(organization_domain, service_lane, created_at DESC);

-- PR #6 audit item 6: policy-rejected opportunities were stored with stage:'discovered', the same
-- stage a freshly-imported, not-yet-evaluated opportunity has, making them indistinguishable from
-- queueable work. This CHECK constraint makes an invalid/typo'd stage value impossible to persist
-- at all, not just discouraged by application convention; 'ready_for_message' and
-- 'policy_rejected' are the two states commercial-intelligence-import.mjs now actually writes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opportunities_stage_check') THEN
    ALTER TABLE opportunities ADD CONSTRAINT opportunities_stage_check
      CHECK (stage IN ('discovered', 'ready_for_message', 'policy_rejected', 'claimed', 'won', 'lost', 'expired'));
  END IF;
END $$;

-- PR #6 audit item 7: message variants must carry the actual message content, not a subject
-- surrogate with signalKey standing in for a body hash.
ALTER TABLE message_variants ADD COLUMN IF NOT EXISTS opportunity_id text REFERENCES opportunities(id) ON DELETE SET NULL;
ALTER TABLE message_variants ADD COLUMN IF NOT EXISTS body text;

INSERT INTO schema_migrations(version)
VALUES ('006_pr6_repair')
ON CONFLICT DO NOTHING;

COMMIT;
