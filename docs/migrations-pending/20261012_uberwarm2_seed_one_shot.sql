-- UberWarm2 owner-controlled placement probes: physical one-shot and daily quota ledger.
-- Additive only. Applying this migration does not send mail or authorize campaigns.
CREATE TABLE IF NOT EXISTS uberwarm2_seed_probe_claims (
  reservation_key TEXT PRIMARY KEY,
  probe_id TEXT NOT NULL,
  batch_digest TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  seed_email TEXT NOT NULL,
  quota_day DATE NOT NULL,
  submitted_state TEXT NOT NULL DEFAULT 'RESERVED'
    CHECK (submitted_state IN ('RESERVED', 'SMTP_ACCEPTED_PLACEMENT_UNKNOWN', 'PROVIDER_ACCEPTED_PLACEMENT_UNKNOWN', 'SUBMISSION_OUTCOME_UNCERTAIN')),
  receipt_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalized_at TIMESTAMPTZ,
  CONSTRAINT uberwarm2_seed_probe_identity CHECK (
    length(reservation_key) BETWEEN 16 AND 160
    AND length(probe_id) BETWEEN 1 AND 250
    AND length(sender_email) > 3 AND length(seed_email) > 3
  )
);
CREATE INDEX IF NOT EXISTS uberwarm2_seed_probe_claims_sender_day_idx
  ON uberwarm2_seed_probe_claims (quota_day, sender_email);
CREATE INDEX IF NOT EXISTS uberwarm2_seed_probe_claims_day_idx
  ON uberwarm2_seed_probe_claims (quota_day);
COMMENT ON TABLE uberwarm2_seed_probe_claims IS
  'One-shot owner-controlled test submissions only; cannot prove real recipient reputation. No prospect traffic.';
CREATE INDEX IF NOT EXISTS uberwarm2_seed_probe_claims_seed_day_idx
  ON uberwarm2_seed_probe_claims (quota_day, seed_email);
