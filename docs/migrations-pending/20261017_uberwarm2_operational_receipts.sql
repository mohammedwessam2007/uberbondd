-- Additive and separate from the one-shot effect ledger. Never rewrite probe claims.
-- Apply transactionally only after verifying the authoritative database and schema.
CREATE TABLE IF NOT EXISTS public.uberwarm2_operational_receipts (
  receipt_digest text PRIMARY KEY CHECK (receipt_digest ~ '^sha256:[a-f0-9]{64}$'),
  source_sha text NOT NULL CHECK (source_sha ~ '^[a-f0-9]{40}$'),
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  receipt_json jsonb NOT NULL CHECK ((
    receipt_json->>'version' = '1' AND
    receipt_json->>'sends' = '0' AND
    receipt_json->>'runtimeReady' = 'false' AND
    receipt_json->>'sendAuthority' = 'NONE' AND
    receipt_json->>'source' = source_sha
  ) IS TRUE)
);
CREATE INDEX IF NOT EXISTS uberwarm2_operational_receipts_observed_idx
  ON public.uberwarm2_operational_receipts (observed_at DESC);
COMMENT ON TABLE public.uberwarm2_operational_receipts IS
  'UberWarm redacted read-monitor observations; not send authority or placement proof. Append-only application writer.';
