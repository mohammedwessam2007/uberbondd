BEGIN;

CREATE TABLE IF NOT EXISTS deliveries (
  id text PRIMARY KEY,
  offer_id text NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  campaign_id text REFERENCES campaigns(id) ON DELETE SET NULL,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  status text NOT NULL,
  delivery_deadline timestamptz NOT NULL,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS deliveries_order_unique ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS deliveries_offer_created_idx ON deliveries(offer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deliveries_status_deadline_idx ON deliveries(status, delivery_deadline);
CREATE INDEX IF NOT EXISTS deliveries_prospect_created_idx ON deliveries(prospect_id, created_at DESC);

INSERT INTO schema_migrations(version) VALUES ('006_paid_delivery_workflow') ON CONFLICT DO NOTHING;
COMMIT;
