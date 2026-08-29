BEGIN;

-- Billing webhook claims are recoverable leases. A crashed worker must not leave
-- verified provider evidence permanently stranded in CLAIMED, and exhausting
-- retries must never silently promote payment truth.
ALTER TABLE billing_webhook_inbox ADD COLUMN IF NOT EXISTS claim_attempts integer NOT NULL DEFAULT 0 CHECK (claim_attempts >= 0);
ALTER TABLE billing_webhook_inbox ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE billing_webhook_inbox ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

CREATE INDEX IF NOT EXISTS billing_webhook_retry_due_idx
  ON billing_webhook_inbox(status, next_attempt_at, claimed_at)
  WHERE status IN ('RECEIVED','RETRYABLE','CLAIMED','UNCERTAIN');

INSERT INTO schema_migrations(version) VALUES ('102_payment_reconciliation_leases') ON CONFLICT DO NOTHING;
COMMIT;
