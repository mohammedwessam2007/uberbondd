-- Diagnostic factory + white-label report + implementation/monitoring fulfillment.
CREATE TABLE IF NOT EXISTS ros_diagnostic_projects (
  id text PRIMARY KEY,
  organization_id text REFERENCES ros_organizations(id),
  payment_id text REFERENCES ros_payments(id),
  status text NOT NULL DEFAULT 'DRAFT',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ros_diagnostic_projects_status_idx ON ros_diagnostic_projects (status);

CREATE TABLE IF NOT EXISTS ros_check_runs (
  id text PRIMARY KEY,
  diagnostic_project_id text REFERENCES ros_diagnostic_projects(id),
  website_id text REFERENCES ros_websites(id),
  idempotency_key text UNIQUE,
  status text NOT NULL DEFAULT 'running',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ros_defects (
  id text PRIMARY KEY,
  diagnostic_project_id text REFERENCES ros_diagnostic_projects(id),
  check_run_id text REFERENCES ros_check_runs(id),
  category text NOT NULL,
  severity text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ros_reports (
  id text PRIMARY KEY,
  diagnostic_project_id text REFERENCES ros_diagnostic_projects(id),
  kind text NOT NULL DEFAULT 'agency_branded',
  status text NOT NULL DEFAULT 'draft',
  manifest_signature text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ros_repair_tasks (
  id text PRIMARY KEY,
  diagnostic_project_id text REFERENCES ros_diagnostic_projects(id),
  defect_id text REFERENCES ros_defects(id),
  status text NOT NULL DEFAULT 'draft',
  margin_rate numeric,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ros_deliveries (
  id text PRIMARY KEY,
  diagnostic_project_id text REFERENCES ros_diagnostic_projects(id),
  zip_sha256 text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ros_monitoring_offers (
  id text PRIMARY KEY,
  diagnostic_project_id text REFERENCES ros_diagnostic_projects(id),
  kind text NOT NULL DEFAULT 'monitoring' CHECK (kind IN ('implementation','monitoring','subscription')),
  status text NOT NULL DEFAULT 'offered',
  price_cents int,
  active boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
