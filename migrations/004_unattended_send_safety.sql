BEGIN;

CREATE TABLE IF NOT EXISTS outbound_reservations (
  id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  campaign_id text REFERENCES campaigns(id) ON DELETE SET NULL,
  inbox text NOT NULL,
  recipient_email text NOT NULL,
  kind text NOT NULL DEFAULT 'initial',
  followup integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  reserved_at timestamptz NOT NULL,
  dispatched_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS outbound_reservations_cap_idx
  ON outbound_reservations(inbox, reserved_at DESC)
  WHERE status IN ('reserved','dispatching','sent','uncertain');
CREATE INDEX IF NOT EXISTS outbound_reservations_prospect_idx
  ON outbound_reservations(prospect_id, kind, followup);

CREATE TABLE IF NOT EXISTS sender_health (
  id text PRIMARY KEY,
  inbox text NOT NULL UNIQUE,
  paused boolean NOT NULL DEFAULT false,
  hard_bounces_today integer NOT NULL DEFAULT 0,
  complaints_today integer NOT NULL DEFAULT 0,
  failure_streak integer NOT NULL DEFAULT 0,
  health_date date NOT NULL DEFAULT CURRENT_DATE,
  last_event_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS outbound_events (
  id text PRIMARY KEY,
  inbox text,
  event_type text NOT NULL,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  recipient_email text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS outbound_events_inbox_time_idx
  ON outbound_events(inbox, occurred_at DESC);
CREATE INDEX IF NOT EXISTS sender_health_paused_idx
  ON sender_health(paused) WHERE paused = true;

INSERT INTO schema_migrations(version) VALUES ('004_unattended_send_safety') ON CONFLICT DO NOTHING;
COMMIT;
