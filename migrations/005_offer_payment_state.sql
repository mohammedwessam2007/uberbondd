BEGIN;

CREATE TABLE IF NOT EXISTS offers (
  id text PRIMARY KEY,
  campaign_id text REFERENCES campaigns(id) ON DELETE SET NULL,
  prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  type text NOT NULL,
  status text NOT NULL,
  owner_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS offers_prospect_type_unique
  ON offers(prospect_id, type)
  WHERE prospect_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS offers_status_idx ON offers(status);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS offer_id text REFERENCES offers(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_state text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_offer_time_idx ON orders(offer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS orders_payment_state_idx ON orders(payment_state);

INSERT INTO schema_migrations(version) VALUES ('005_offer_payment_state') ON CONFLICT DO NOTHING;
COMMIT;
