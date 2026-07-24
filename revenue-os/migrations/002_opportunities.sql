-- Opportunity graph + evidence ledger.
CREATE TABLE IF NOT EXISTS ros_opportunities (
  id text PRIMARY KEY,
  organization_id text REFERENCES ros_organizations(id),
  organization_domain text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'candidate',
  score numeric,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_domain, channel)
);
CREATE INDEX IF NOT EXISTS ros_opportunities_status_idx ON ros_opportunities (status);
CREATE INDEX IF NOT EXISTS ros_opportunities_score_idx ON ros_opportunities (score DESC);

CREATE TABLE IF NOT EXISTS ros_evidence_items (
  id text PRIMARY KEY,
  opportunity_id text REFERENCES ros_opportunities(id),
  organization_id text REFERENCES ros_organizations(id),
  source_url text,
  source_type text,
  raw_hash text,
  verified boolean NOT NULL DEFAULT false,
  confidence numeric,
  captured_at timestamptz,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ros_evidence_items_opportunity_idx ON ros_evidence_items (opportunity_id);
