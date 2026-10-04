BEGIN;

-- The Postgres store has mapped outboundEvents.providerEventId to this column
-- since the unattended-send safety layer, but migration 004 never created it.
-- Keep 004 immutable as historical lineage and repair already-migrated databases
-- with an additive idempotent migration.
ALTER TABLE outbound_events
  ADD COLUMN IF NOT EXISTS provider_event_id text;

CREATE INDEX IF NOT EXISTS outbound_events_provider_event_id_idx
  ON outbound_events(provider_event_id)
  WHERE provider_event_id IS NOT NULL;

INSERT INTO schema_migrations(version)
VALUES ('20261004_outbound_events_provider_event_id')
ON CONFLICT DO NOTHING;

COMMIT;
