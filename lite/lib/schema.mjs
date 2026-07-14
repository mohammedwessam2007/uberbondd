// Single source of truth for the Cash Engine Lite schema.
// Embedded as a string so Vercel's function bundler always includes it.
// lite/migrations/lite_001.sql must stay byte-identical (a test enforces this).
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS lite_audit_requests (
  id TEXT PRIMARY KEY,
  website_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  report_token_hash TEXT NOT NULL UNIQUE,
  requester_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lite_audit_requests_status_idx ON lite_audit_requests(status, created_at);
CREATE INDEX IF NOT EXISTS lite_audit_requests_requester_idx ON lite_audit_requests(requester_hash, created_at);
CREATE INDEX IF NOT EXISTS lite_audit_requests_email_idx ON lite_audit_requests(email, created_at);

CREATE TABLE IF NOT EXISTS lite_reports (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES lite_audit_requests(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  score INTEGER NOT NULL,
  summary JSONB NOT NULL,
  findings JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lite_leads (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES lite_audit_requests(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  message TEXT,
  requester_hash TEXT NOT NULL DEFAULT '',
  owner_notified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lite_leads_request_idx ON lite_leads(request_id, created_at);
CREATE INDEX IF NOT EXISTS lite_leads_requester_idx ON lite_leads(requester_hash, created_at);
CREATE INDEX IF NOT EXISTS lite_leads_notified_idx ON lite_leads(owner_notified, created_at);
`;
