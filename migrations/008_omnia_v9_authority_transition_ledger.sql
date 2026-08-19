CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE OR REPLACE FUNCTION omnia_v9_capture_authority_transition()
RETURNS trigger AS $$
DECLARE
  v_previous_digest text;
  v_previous_sequence integer;
  v_sequence integer;
  v_from_status text;
  v_occurred_at timestamptz := clock_timestamp();
  v_payload jsonb;
  v_event_digest text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_from_status := NULL;
  ELSE
    IF NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.reason IS NOT DISTINCT FROM OLD.reason THEN
      RETURN NEW;
    END IF;
    v_from_status := OLD.status;
  END IF;

  SELECT event_digest, sequence_no
    INTO v_previous_digest, v_previous_sequence
  FROM omnia_v9_authority_transition_events
  WHERE idempotency_key = NEW.idempotency_key
  ORDER BY sequence_no DESC
  LIMIT 1;

  v_sequence := COALESCE(v_previous_sequence, 0) + 1;
  v_payload := jsonb_build_object(
    'schemaVersion', 'omnia.v9.authority-transition.p9',
    'idempotencyKey', NEW.idempotency_key,
    'sequenceNo', v_sequence,
    'tenantId', NEW.tenant_id,
    'intentDigest', NEW.intent_digest,
    'approvalId', NEW.approval_id,
    'fromStatus', v_from_status,
    'toStatus', NEW.status,
    'reason', NEW.reason,
    'previousEventDigest', v_previous_digest,
    'occurredAt', to_char(v_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_event_digest := encode(digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO omnia_v9_authority_transition_events(
    event_digest,idempotency_key,sequence_no,tenant_id,intent_digest,approval_id,
    from_status,to_status,reason,previous_event_digest,occurred_at,event
  ) VALUES (
    v_event_digest,NEW.idempotency_key,v_sequence,NEW.tenant_id,NEW.intent_digest,NEW.approval_id,
    v_from_status,NEW.status,NEW.reason,v_previous_digest,v_occurred_at,
    v_payload || jsonb_build_object('eventDigest', v_event_digest)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS omnia_v9_authority_transition_capture ON omnia_v9_authority_reservations;
CREATE TRIGGER omnia_v9_authority_transition_capture
AFTER INSERT OR UPDATE OF status, reason ON omnia_v9_authority_reservations
FOR EACH ROW EXECUTE FUNCTION omnia_v9_capture_authority_transition();

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

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES ('008_omnia_v9_authority_transition_ledger') ON CONFLICT DO NOTHING;
