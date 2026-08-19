-- OMNIA V9 external-effect crash-recovery mission (Mission 6). Composes with,
-- rather than duplicates, the existing P9 authority-transition-ledger pattern
-- (008_omnia_v9_authority_transition_ledger.sql): the same append-only,
-- hash-chained, trigger-captured design is reused here for execution
-- transitions, keyed by execution_id instead of idempotency_key. This is a
-- separate, additive, non-frozen set of tables -- it does not modify any
-- frozen P1-P9 table.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The durable external-effect execution object. Must exist, in state
-- PREPARED, before any provider call is possible (V9_EXTERNAL_EFFECT_PROTOCOL.md
-- section "durable execution intent").
CREATE TABLE IF NOT EXISTS omnia_v9_external_effect_executions (
  execution_id text PRIMARY KEY,
  action_intent_digest text NOT NULL CHECK (action_intent_digest ~ '^[0-9a-f]{64}$'),
  authorization_digest text NOT NULL,
  tenant_id text NOT NULL,
  operation text NOT NULL,
  resource text NOT NULL,
  business_key text NOT NULL,
  provider text NOT NULL,
  provider_effect_identity text NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  status text NOT NULL CHECK (status IN (
    'PREPARED','DISPATCHING','PROVIDER_ACCEPTED','PROVIDER_REJECTED','RESULT_UNCERTAIN',
    'RECONCILING','RECONCILED_ACCEPTED','RECONCILED_REJECTED','RECONCILED_NOT_SUBMITTED',
    'OWNER_REVIEW_REQUIRED','ABORTED_BEFORE_DISPATCH'
  )),
  constitution_digest text NOT NULL,
  policy_digest text NOT NULL,
  approval_id text NOT NULL,
  consequence_class text NOT NULL,
  provider_reference_id text NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most one *active* (non-aborted) execution per logical consequence. An
-- execution that is proven, via reconciliation, to have never reached the
-- provider (ABORTED_BEFORE_DISPATCH) does not occupy this slot -- a new
-- execution row (new execution_id, incremented attempt_number, same
-- business_key) may then legally be prepared. This partial unique index IS
-- the database-enforced form of "retry permitted only when proven
-- non-submission" (V9_EXTERNAL_EFFECT_PROTOCOL.md, safe retry policy): the
-- database physically refuses a second active row for the same business key
-- while the first is unresolved or was proven to have possibly submitted.
-- RECONCILED_NOT_SUBMITTED (reconciliation affirmatively proves the
-- provider never received this request, even though dispatch was durably
-- attempted) also releases the business key, for the same reason.
CREATE UNIQUE INDEX IF NOT EXISTS uq_omnia_v9_external_effect_executions_active_business_key
  ON omnia_v9_external_effect_executions(business_key)
  WHERE status NOT IN ('ABORTED_BEFORE_DISPATCH', 'RECONCILED_NOT_SUBMITTED');

CREATE INDEX IF NOT EXISTS idx_omnia_v9_external_effect_executions_status
  ON omnia_v9_external_effect_executions(status, updated_at ASC);
CREATE INDEX IF NOT EXISTS idx_omnia_v9_external_effect_executions_tenant
  ON omnia_v9_external_effect_executions(tenant_id, created_at DESC);

-- Database-enforced legal-transition table, mirroring
-- src/omnia-v9/integrations/external-effect-state-machine.mjs exactly.
-- tests/omnia-v9-external-effect-state-machine.test.mjs exhaustively checks
-- every (from,to) pair against both the JS module and this trigger and
-- asserts they never disagree -- this is not merely an application
-- convention, per this mission's explicit instruction.
CREATE OR REPLACE FUNCTION omnia_v9_check_execution_transition()
RETURNS trigger AS $$
DECLARE
  v_from text;
  v_to text := NEW.status;
  v_legal boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_from := NULL;
    IF v_to = 'PREPARED' THEN v_legal := true; END IF;
  ELSE
    v_from := OLD.status;
    IF v_from = v_to THEN
      RETURN NEW; -- no-op updates (e.g. touching reason/provider_reference_id) are not transitions
    END IF;
    v_legal := (v_from, v_to) IN (
      ('PREPARED','DISPATCHING'), ('PREPARED','ABORTED_BEFORE_DISPATCH'),
      ('DISPATCHING','PROVIDER_ACCEPTED'), ('DISPATCHING','PROVIDER_REJECTED'), ('DISPATCHING','RESULT_UNCERTAIN'),
      ('RESULT_UNCERTAIN','RECONCILING'),
      ('RECONCILING','RECONCILED_ACCEPTED'), ('RECONCILING','RECONCILED_REJECTED'), ('RECONCILING','RECONCILED_NOT_SUBMITTED'),
      ('RECONCILING','OWNER_REVIEW_REQUIRED'), ('RECONCILING','RESULT_UNCERTAIN'),
      ('OWNER_REVIEW_REQUIRED','RECONCILED_ACCEPTED'), ('OWNER_REVIEW_REQUIRED','RECONCILED_REJECTED'),
      ('OWNER_REVIEW_REQUIRED','RECONCILED_NOT_SUBMITTED'), ('OWNER_REVIEW_REQUIRED','RECONCILING')
    );
  END IF;

  IF NOT v_legal THEN
    RAISE EXCEPTION 'illegal execution transition: % -> % (execution_id=%)', COALESCE(v_from,'<new>'), v_to, NEW.execution_id
      USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS omnia_v9_execution_transition_guard ON omnia_v9_external_effect_executions;
CREATE TRIGGER omnia_v9_execution_transition_guard
BEFORE INSERT OR UPDATE OF status ON omnia_v9_external_effect_executions
FOR EACH ROW EXECUTE FUNCTION omnia_v9_check_execution_transition();

-- Append-only, hash-chained execution-transition ledger. Same pattern as
-- omnia_v9_authority_transition_events (008), composed rather than
-- duplicated: chain key is execution_id instead of idempotency_key.
CREATE TABLE IF NOT EXISTS omnia_v9_execution_transition_events (
  event_digest text PRIMARY KEY CHECK (event_digest ~ '^[0-9a-f]{64}$'),
  execution_id text NOT NULL,
  sequence_no integer NOT NULL CHECK (sequence_no > 0),
  tenant_id text NOT NULL,
  business_key text NOT NULL,
  from_status text NULL,
  to_status text NOT NULL,
  reason text NOT NULL DEFAULT '',
  previous_event_digest text NULL CHECK (previous_event_digest IS NULL OR previous_event_digest ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL,
  event jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (execution_id, sequence_no),
  UNIQUE (execution_id, event_digest)
);

CREATE INDEX IF NOT EXISTS idx_omnia_v9_execution_transition_events_exec_seq
  ON omnia_v9_execution_transition_events(execution_id, sequence_no ASC);

CREATE OR REPLACE FUNCTION omnia_v9_capture_execution_transition()
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
  FROM omnia_v9_execution_transition_events
  WHERE execution_id = NEW.execution_id
  ORDER BY sequence_no DESC
  LIMIT 1;

  v_sequence := COALESCE(v_previous_sequence, 0) + 1;
  v_payload := jsonb_build_object(
    'schemaVersion', 'omnia.v9.execution-transition.v1',
    'executionId', NEW.execution_id,
    'sequenceNo', v_sequence,
    'tenantId', NEW.tenant_id,
    'businessKey', NEW.business_key,
    'fromStatus', v_from_status,
    'toStatus', NEW.status,
    'reason', NEW.reason,
    'previousEventDigest', v_previous_digest,
    'occurredAt', to_char(v_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_event_digest := encode(digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO omnia_v9_execution_transition_events(
    event_digest,execution_id,sequence_no,tenant_id,business_key,
    from_status,to_status,reason,previous_event_digest,occurred_at,event
  ) VALUES (
    v_event_digest,NEW.execution_id,v_sequence,NEW.tenant_id,NEW.business_key,
    v_from_status,NEW.status,NEW.reason,v_previous_digest,v_occurred_at,
    v_payload || jsonb_build_object('eventDigest', v_event_digest)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS omnia_v9_execution_transition_capture ON omnia_v9_external_effect_executions;
CREATE TRIGGER omnia_v9_execution_transition_capture
AFTER INSERT OR UPDATE OF status, reason ON omnia_v9_external_effect_executions
FOR EACH ROW EXECUTE FUNCTION omnia_v9_capture_execution_transition();

CREATE OR REPLACE FUNCTION omnia_v9_reject_execution_transition_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'omnia_v9_execution_transition_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS omnia_v9_execution_transition_events_no_update ON omnia_v9_execution_transition_events;
CREATE TRIGGER omnia_v9_execution_transition_events_no_update
BEFORE UPDATE ON omnia_v9_execution_transition_events
FOR EACH ROW EXECUTE FUNCTION omnia_v9_reject_execution_transition_mutation();

DROP TRIGGER IF EXISTS omnia_v9_execution_transition_events_no_delete ON omnia_v9_execution_transition_events;
CREATE TRIGGER omnia_v9_execution_transition_events_no_delete
BEFORE DELETE ON omnia_v9_execution_transition_events
FOR EACH ROW EXECUTE FUNCTION omnia_v9_reject_execution_transition_mutation();

-- Provider evidence: every fact this system holds about what a provider
-- actually did. Never a bare boolean -- always full provenance. Nothing
-- reads a caller-supplied "providerConfirmed=true"; classifyOutcome() always
-- derives a lifecycle from a structured evidence object shaped like this.
CREATE TABLE IF NOT EXISTS omnia_v9_external_effect_provider_evidence (
  evidence_id text PRIMARY KEY CHECK (evidence_id ~ '^[0-9a-f]{64}$'),
  execution_id text NOT NULL REFERENCES omnia_v9_external_effect_executions(execution_id),
  provider text NOT NULL,
  account_identity text NOT NULL DEFAULT '',
  business_identity text NOT NULL,
  provider_reference_id text NULL,
  observed_at timestamptz NOT NULL,
  evidence_type text NOT NULL CHECK (evidence_type IN ('DISPATCH_RESPONSE','RECONCILIATION_LOOKUP','OWNER_ASSERTION')),
  acquisition_method text NOT NULL,
  reconciliation_source text NOT NULL DEFAULT '',
  lifecycle text NOT NULL CHECK (lifecycle IN ('ACCEPTED','REJECTED','UNCERTAIN','RECONCILED_ACCEPTED','RECONCILED_REJECTED','NOT_FOUND','AMBIGUOUS')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_omnia_v9_external_effect_provider_evidence_execution
  ON omnia_v9_external_effect_provider_evidence(execution_id, created_at ASC);

-- Provider evidence is itself append-only: a second, contradictory piece of
-- evidence must be recorded alongside the first (both inform reconciliation
-- and can trigger OWNER_REVIEW_REQUIRED), never silently overwrite it.
CREATE OR REPLACE FUNCTION omnia_v9_reject_provider_evidence_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'omnia_v9_external_effect_provider_evidence is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS omnia_v9_external_effect_provider_evidence_no_update ON omnia_v9_external_effect_provider_evidence;
CREATE TRIGGER omnia_v9_external_effect_provider_evidence_no_update
BEFORE UPDATE ON omnia_v9_external_effect_provider_evidence
FOR EACH ROW EXECUTE FUNCTION omnia_v9_reject_provider_evidence_mutation();

DROP TRIGGER IF EXISTS omnia_v9_external_effect_provider_evidence_no_delete ON omnia_v9_external_effect_provider_evidence;
CREATE TRIGGER omnia_v9_external_effect_provider_evidence_no_delete
BEFORE DELETE ON omnia_v9_external_effect_provider_evidence
FOR EACH ROW EXECUTE FUNCTION omnia_v9_reject_provider_evidence_mutation();

-- Simulated provider-side ledger for null-sink-v2 (Null Sink V2). This
-- stands in for "the provider's own database" -- state that would survive
-- our own process crashing, populated by the simulator's dispatch() call
-- independently of whether OUR local response/receipt path completes. A
-- real Gmail adapter's analogue would be Gmail's own mailbox, queried via
-- rfc822msgid: search (see V9_GMAIL_IDEMPOTENCY_AND_RECONCILIATION_RESEARCH.md).
CREATE TABLE IF NOT EXISTS omnia_v9_null_provider_ledger (
  business_identity text PRIMARY KEY,
  outcome text NOT NULL CHECK (outcome IN ('ACCEPTED','REJECTED')),
  provider_reference_id text NOT NULL,
  simulation_mode text NOT NULL,
  visible_after timestamptz NULL,
  ambiguous boolean NOT NULL DEFAULT false,
  contradictory boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES ('011_omnia_v9_external_effect_executions') ON CONFLICT DO NOTHING;
