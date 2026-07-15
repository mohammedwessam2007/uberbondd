
CREATE TABLE IF NOT EXISTS lite_audit_requests (
  id TEXT PRIMARY KEY,
  website_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  processing_stage TEXT NOT NULL DEFAULT 'waiting_for_audit_worker',
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
ALTER TABLE lite_audit_requests ADD COLUMN IF NOT EXISTS processing_stage TEXT NOT NULL DEFAULT 'waiting_for_audit_worker';

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
  selected_issue_code TEXT,
  service_interest TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  source_page TEXT NOT NULL DEFAULT 'private_report',
  dedupe_key TEXT,
  requester_hash TEXT NOT NULL DEFAULT '',
  owner_notified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lite_leads_request_idx ON lite_leads(request_id, created_at);
CREATE INDEX IF NOT EXISTS lite_leads_requester_idx ON lite_leads(requester_hash, created_at);
CREATE INDEX IF NOT EXISTS lite_leads_notified_idx ON lite_leads(owner_notified, created_at);
ALTER TABLE lite_leads ADD COLUMN IF NOT EXISTS selected_issue_code TEXT;
ALTER TABLE lite_leads ADD COLUMN IF NOT EXISTS service_interest TEXT;
ALTER TABLE lite_leads ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE lite_leads ADD COLUMN IF NOT EXISTS source_page TEXT NOT NULL DEFAULT 'private_report';
ALTER TABLE lite_leads ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS lite_leads_dedupe_idx ON lite_leads(dedupe_key) WHERE dedupe_key IS NOT NULL;
