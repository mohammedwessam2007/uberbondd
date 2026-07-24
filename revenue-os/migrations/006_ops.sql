-- Funnel experiments, owner queue, blockers, audit, and the generic job/settings tables
-- DurableQueue (reused from ../../src/queue.mjs) needs.
CREATE TABLE IF NOT EXISTS ros_experiments (
  id text PRIMARY KEY,
  name text NOT NULL,
  variant text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ros_owner_actions (
  id text PRIMARY KEY,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  score numeric,
  status text NOT NULL DEFAULT 'open',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ros_owner_actions_status_idx ON ros_owner_actions (status);

CREATE TABLE IF NOT EXISTS ros_blockers (
  id text PRIMARY KEY,
  workstream text NOT NULL,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ros_audit_events (
  id text PRIMARY KEY,
  actor text,
  event_type text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ros_jobs (
  id text PRIMARY KEY,
  type text NOT NULL,
  queue text,
  status text NOT NULL DEFAULT 'queued',
  priority int NOT NULL DEFAULT 0,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  scheduled_at timestamptz,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  heartbeat_at timestamptz,
  last_error text,
  dedupe_key text UNIQUE,
  singleton_key text,
  dead_lettered_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ros_jobs_status_idx ON ros_jobs (status);
CREATE INDEX IF NOT EXISTS ros_jobs_singleton_key_idx ON ros_jobs (singleton_key);

CREATE TABLE IF NOT EXISTS ros_audit_log (
  id text PRIMARY KEY,
  type text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ros_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
