CREATE TABLE IF NOT EXISTS omnia_v9_execution_authorization_bindings (
  reservation_id TEXT PRIMARY KEY REFERENCES omnia_v9_execution_receipt_bindings(reservation_id) ON DELETE RESTRICT,
  receipt_digest TEXT NOT NULL UNIQUE,
  binding_digest TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  intent_digest TEXT NOT NULL,
  authorization_decision_digest TEXT NOT NULL,
  approval_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  policy_digest TEXT NOT NULL,
  constitution_digest TEXT NOT NULL,
  binding JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT omnia_v9_execution_authorization_receipt_fk
    FOREIGN KEY (receipt_digest) REFERENCES omnia_v9_execution_receipt_bindings(receipt_digest) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_omnia_v9_execution_authorization_tenant_intent
  ON omnia_v9_execution_authorization_bindings(tenant_id, intent_digest);
