BEGIN;

CREATE TABLE IF NOT EXISTS experiments (
  id text PRIMARY KEY,
  campaign_id text REFERENCES campaigns(id) ON DELETE SET NULL,
  dimension text NOT NULL,
  status text NOT NULL,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS experiments_campaign_created_idx
  ON experiments(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS experiments_dimension_status_idx
  ON experiments(dimension, status);

INSERT INTO schema_migrations(version) VALUES ('007_acquisition_learning') ON CONFLICT DO NOTHING;
COMMIT;
