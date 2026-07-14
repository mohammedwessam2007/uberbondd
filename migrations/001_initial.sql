BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id text PRIMARY KEY,
  system_key text UNIQUE,
  approved boolean NOT NULL DEFAULT false,
  auto_send boolean NOT NULL DEFAULT false,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id text PRIMARY KEY,
  prospect_id text,
  access_token_hash text UNIQUE,
  status text,
  payment_status text,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS prospects (
  id text PRIMARY KEY,
  domain text NOT NULL UNIQUE,
  campaign_id text REFERENCES campaigns(id) ON DELETE SET NULL,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  monitoring_run_id text,
  status text,
  next_followup_at timestamptz,
  thread_id text,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

-- leads.prospect_id is indexed in JSON and intentionally has no FK because inbound
-- lead/prospect records are created as a circular pair. prospects.lead_id retains
-- the safe historical FK to leads.

CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  type text,
  status text,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  campaign_id text REFERENCES campaigns(id) ON DELETE SET NULL,
  inbox text,
  gmail_id text,
  thread_id text,
  sent_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS replies (
  id text PRIMARY KEY,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  gmail_id text UNIQUE,
  thread_id text,
  received_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS suppressions (
  id text PRIMARY KEY,
  value text NOT NULL UNIQUE,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS social_tasks (
  id text PRIMARY KEY,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS social_tasks_prospect_unique
  ON social_tasks(prospect_id) WHERE prospect_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY,
  slot text NOT NULL UNIQUE,
  connected boolean NOT NULL DEFAULT false,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id text PRIMARY KEY,
  type text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  provider text,
  provider_event_id text UNIQUE,
  event_name text,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id text PRIMARY KEY,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  provider_id text,
  status text,
  next_run_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS monitoring_runs (
  id text PRIMARY KEY,
  subscription_id text REFERENCES subscriptions(id) ON DELETE SET NULL,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  status text,
  created_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  type text,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS revenue_events (
  id text PRIMARY KEY,
  provider_event_id text UNIQUE,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  created_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS discovery_runs (
  id text PRIMARY KEY,
  provider text,
  campaign_id text REFERENCES campaigns(id) ON DELETE SET NULL,
  status text,
  run_date date NOT NULL,
  imported_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS prospects_status_idx ON prospects(status);
CREATE INDEX IF NOT EXISTS prospects_campaign_idx ON prospects(campaign_id);
CREATE INDEX IF NOT EXISTS prospects_next_followup_idx ON prospects(next_followup_at) WHERE next_followup_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS prospects_thread_idx ON prospects(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_sent_inbox_idx ON messages(inbox, sent_at);
CREATE INDEX IF NOT EXISTS replies_received_idx ON replies(received_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_next_run_idx ON subscriptions(next_run_at) WHERE next_run_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);
CREATE INDEX IF NOT EXISTS discovery_run_date_status_idx ON discovery_runs(run_date, status);
CREATE INDEX IF NOT EXISTS leads_token_hash_idx ON leads(access_token_hash);
CREATE INDEX IF NOT EXISTS notifications_status_idx ON notifications(status);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
CREATE INDEX IF NOT EXISTS monitoring_runs_status_idx ON monitoring_runs(status);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at DESC);

INSERT INTO schema_migrations(version) VALUES ('001_initial') ON CONFLICT DO NOTHING;
COMMIT;
