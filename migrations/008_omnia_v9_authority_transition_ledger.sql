CREATE TABLE IF NOT EXISTS omnia_v9_authority_transition_events (
  event_digest text PRIMARY KEY CHECK (event_digest ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL,
  sequence_no integer NOT NULL CHECK (sequence_no > 0),
  tenant_id text NOT NULL,
  intent_digest text NOT NULL CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
  approval_id text NOT NULL,
  from_status text NULL CHECK (from_status IS NULL OR from_status IN ('PENDING','RESERVED','COMMITTED','UNCERTAIN','RELEASED','DENIED')),
  to_status text NOT NULL CHECK (to_status IN ('PENDING','RESERVED','COMMITTED','UNCERTAIN','RELEASED','DENIED')),
  reason text NOT NULL DEFAULT '',
  previous_event_digest text NULL CHECK (previous_event_digest IS NULL OR previous_event_digest ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL,
  event jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key, sequence_no),
  UNIQUE (idempotency_key, event_digest)
);

CREATE INDEX IF NOT EXISTS idx_omnia_v9_authority_transition_events_key_seq
  ON omnia_v9_authority_transition_events(idempotency_key, sequence_no ASC);
CREATE INDEX IF NOT EXISTS idx_omnia_v9_authority_transition_events_tenant_time
  ON omnia_v9_authority_transition_events(tenant_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION omnia_v9_reject_authority_transition_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'omnia_v9_authority_transition_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS omnia_v9_authority_transition_events_no_update ON omnia_v9_authority_transition_events;
CREATE TRIGGER omnia_v9_authority_transition_events_no_update
BEFORE UPDATE ON omnia_v9_authority_transition_events
FOR EACH ROW EXECUTE FUNCTION omnia_v9_reject_authority_transition_mutation();

DROP TRIGGER IF EXISTS omnia_v9_authority_transition_events_no_delete ON omnia_v9_authority_transition_events;
CREATE TRIGGER omnia_v9_authority_transition_events_no_delete
BEFORE DELETE ON omnia_v9_authority_transition_events
FOR EACH ROW EXECUTE FUNCTION omnia_v9_reject_authority_transition_mutation();
