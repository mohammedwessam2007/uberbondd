BEGIN;

-- Fulfillment task queue (spec section I): one row per assigned unit of fulfillment work,
-- routed to a lane (Mohamed / contractor / client-provider) with an SLA due timestamp. Separate
-- from `deliveries` (the payment-gated delivery record itself) because a single delivery can
-- spawn more than one routed task (e.g. onboarding + implementation) and because lane assignment
-- and SLA tracking are automation-layer concerns, not part of the delivery state machine.
CREATE TABLE IF NOT EXISTS fulfillment_tasks (
  id text PRIMARY KEY,
  delivery_id text REFERENCES deliveries(id) ON DELETE CASCADE,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  lane text NOT NULL CHECK (lane IN ('mohamed', 'contractor', 'client_provider')),
  status text NOT NULL CHECK (status IN ('assigned', 'in-progress', 'blocked', 'completed', 'cancelled')),
  sla_due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS fulfillment_tasks_status_idx ON fulfillment_tasks(status);
CREATE INDEX IF NOT EXISTS fulfillment_tasks_delivery_idx ON fulfillment_tasks(delivery_id);
CREATE INDEX IF NOT EXISTS fulfillment_tasks_sla_due_idx ON fulfillment_tasks(sla_due_at);

-- Point-in-time owner digests (spec section K: daily digest / weekly health report), persisted so
-- the control center and owner exception runbook can show digest history instead of only the
-- latest snapshot.
CREATE TABLE IF NOT EXISTS automation_digests (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('daily', 'weekly')),
  digest_date text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS automation_digests_kind_date_idx ON automation_digests(kind, digest_date);

INSERT INTO schema_migrations(version) VALUES ('012_automation_layer') ON CONFLICT DO NOTHING;
COMMIT;
