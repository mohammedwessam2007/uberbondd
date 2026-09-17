BEGIN;

-- The store map has always reserved these collections for the recovered
-- lead-intelligence and Instantly-parity layers.  Keep their PostgreSQL
-- backing tables explicit: a read-only live snapshot must not fail because a
-- durable collection exists only in the JSON backend.

CREATE TABLE IF NOT EXISTS provider_events (
  id text PRIMARY KEY,
  provider text,
  provider_event_key text UNIQUE,
  provider_event_id text,
  event_type text,
  campaign_id text,
  lead_email text,
  status text,
  received_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_lists (
  id text PRIMARY KEY,
  name text,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS reply_drafts (
  id text PRIMARY KEY,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  thread_id text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_plans (
  id text PRIMARY KEY,
  name text,
  trigger text,
  enabled boolean,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id text PRIMARY KEY,
  plan_id text,
  event_key text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_searches (
  id text PRIMARY KEY,
  name text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_signals (
  id text PRIMARY KEY,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  type text,
  source_url text,
  observed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_enrichment_runs (
  id text PRIMARY KEY,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  status text,
  provider text,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_intake_events (
  id text PRIMARY KEY,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  account_key text,
  kind text,
  source_type text,
  status text,
  observed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_field_results (
  id text PRIMARY KEY,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  field text,
  provider text,
  status text,
  observed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_tasks (
  id text PRIMARY KEY,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  account_key text,
  task_type text,
  status text,
  priority integer,
  due_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS provider_events_received_idx ON provider_events(received_at DESC);
CREATE INDEX IF NOT EXISTS reply_drafts_status_idx ON reply_drafts(status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS automation_runs_plan_event_uidx
  ON automation_runs(plan_id, event_key)
  WHERE plan_id IS NOT NULL AND event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_signals_prospect_observed_idx ON lead_signals(prospect_id, observed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS lead_signals_digest_uidx
  ON lead_signals(prospect_id, (data->>'digest'))
  WHERE prospect_id IS NOT NULL AND data ? 'digest';
CREATE UNIQUE INDEX IF NOT EXISTS lead_enrichment_runs_plan_uidx
  ON lead_enrichment_runs(prospect_id, (data->>'planId'))
  WHERE prospect_id IS NOT NULL AND data ? 'planId';
CREATE UNIQUE INDEX IF NOT EXISTS lead_intake_events_digest_uidx
  ON lead_intake_events((data->>'digest'))
  WHERE data ? 'digest';
CREATE UNIQUE INDEX IF NOT EXISTS lead_intake_events_idempotency_uidx
  ON lead_intake_events((data->>'idempotencyKey'))
  WHERE data ? 'idempotencyKey';
CREATE INDEX IF NOT EXISTS lead_field_results_prospect_idx ON lead_field_results(prospect_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS lead_tasks_queue_idx ON lead_tasks(status, priority DESC, due_at ASC);

INSERT INTO schema_migrations(version)
VALUES ('106_lead_intelligence_collections')
ON CONFLICT DO NOTHING;
COMMIT;
