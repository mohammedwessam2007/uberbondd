-- Approval-gated outbound path: message drafts, owner approvals, send records (never a real send),
-- inbound replies, and the suppression/complaint/bounce/unsubscribe ledger.
CREATE TABLE IF NOT EXISTS ros_message_drafts (
  id text PRIMARY KEY,
  opportunity_id text REFERENCES ros_opportunities(id),
  channel text NOT NULL,
  message_hash text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ros_approvals (
  id text PRIMARY KEY,
  message_draft_id text REFERENCES ros_message_drafts(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  reviewed_by text,
  reviewed_at timestamptz,
  expires_at timestamptz,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ros_approvals_status_idx ON ros_approvals (status);

CREATE TABLE IF NOT EXISTS ros_send_records (
  id text PRIMARY KEY,
  approval_id text REFERENCES ros_approvals(id),
  mode text NOT NULL CHECK (mode IN ('dry-run','export-only','draft-only','manual-copy','fake-replay')),
  idempotency_key text UNIQUE,
  recipient_message_hash text NOT NULL,
  status text NOT NULL DEFAULT 'exported',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ros_replies (
  id text PRIMARY KEY,
  opportunity_id text REFERENCES ros_opportunities(id),
  classification text,
  received_at timestamptz,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ros_suppressions (
  id text PRIMARY KEY,
  organization_id text REFERENCES ros_organizations(id),
  reason text NOT NULL CHECK (reason IN ('unsubscribe','complaint','bounce','manual','legal_concern')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ros_suppressions_org_idx ON ros_suppressions (organization_id);
