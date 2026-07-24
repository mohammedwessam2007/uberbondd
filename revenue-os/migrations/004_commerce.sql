-- Proposal/invoice-handoff/payment. Payment carries the mission's exact 13-state vocabulary and
-- never a stored credential -- evidence_hash is a content hash of operator-supplied evidence, not
-- a secret.
CREATE TABLE IF NOT EXISTS ros_proposals (
  id text PRIMARY KEY,
  opportunity_id text REFERENCES ros_opportunities(id),
  kind text NOT NULL DEFAULT 'proposal' CHECK (kind IN ('proposal','sow','scope_acceptance')),
  total_cents int,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ros_invoice_handoffs (
  id text PRIMARY KEY,
  proposal_id text REFERENCES ros_proposals(id),
  amount_cents int NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ros_payments (
  id text PRIMARY KEY,
  invoice_handoff_id text REFERENCES ros_invoice_handoffs(id),
  status text NOT NULL DEFAULT 'NOT_REQUESTED' CHECK (status IN (
    'NOT_REQUESTED','REQUEST_READY','REQUESTED_EXTERNALLY','CUSTOMER_REPORTED',
    'PENDING_VERIFICATION','VERIFIED','SETTLED','PARTIALLY_REFUNDED','REFUNDED',
    'DISPUTED','FAILED','MISMATCH','BLOCKED'
  )),
  provider text NOT NULL DEFAULT 'fake-replay',
  amount_cents int,
  currency text,
  evidence_hash text UNIQUE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ros_payments_status_idx ON ros_payments (status);
