-- Explicit operator-reviewed migration. No automatic deploy/application.
CREATE TABLE IF NOT EXISTS uberwarm2_seed_probes (
    reservation_id TEXT PRIMARY KEY,
    day DATE NOT NULL,
    sender_email TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('RESERVED','PROVIDER_ACCEPTED_NOT_INBOX_PROVEN','OUTCOME_UNCERTAIN')),
    provider_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_result_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS uberwarm2_seed_probes_sender_day ON uberwarm2_seed_probes(day, sender_email);
CREATE INDEX IF NOT EXISTS uberwarm2_seed_probes_recipient_day ON uberwarm2_seed_probes(day, recipient_email);