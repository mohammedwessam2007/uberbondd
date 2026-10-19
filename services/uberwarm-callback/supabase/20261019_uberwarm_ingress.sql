-- Dedicated, inaccessible-by-Data-API inbound safety quarantine.
-- This table is an ingress inbox; NEVER treated as authoritative suppression
-- clearance for sending until the canonical UberBond gate reconciles it.
CREATE SCHEMA IF NOT EXISTS uberwarm_ingress;
REVOKE ALL ON SCHEMA uberwarm_ingress FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS uberwarm_ingress.signed_events (
  event_id text PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 240),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 120),
  payload_digest text NOT NULL CHECK (payload_digest ~ '^sha256:[a-f0-9]{64}$'),
  recipient_digest text,
  action text NOT NULL CHECK (action IN ('OBSERVED','BOUNCE_SUPPRESSED','COMPLAINT_SUPPRESSED','REPLY_REVIEW')),
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS uberwarm_ingress.suppressions (
  recipient text PRIMARY KEY CHECK (length(recipient) BETWEEN 3 AND 320),
  first_event_id text NOT NULL REFERENCES uberwarm_ingress.signed_events(event_id),
  reason text NOT NULL CHECK (reason IN ('BOUNCE','COMPLAINT')),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ALL TABLES IN SCHEMA uberwarm_ingress FROM PUBLIC, anon, authenticated;
