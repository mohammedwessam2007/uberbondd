-- Records the ledger rows that two earlier migrations never wrote for themselves.
-- 100_cost_stage_fulfill_learn and 20261008_phoenix_owner_vault hold idempotent DDL only, so
-- PostgresStore.migrate() counted them as unapplied and ran both again on every start.
-- Neither file is edited, because applied migrations stay byte-identical. The runner applies
-- files in sorted order, so both earlier files have already run in the same pass before this
-- file records them. This file records its own version too.
INSERT INTO schema_migrations(version)
VALUES ('100_cost_stage_fulfill_learn'), ('20261008_phoenix_owner_vault'), ('20261014_record_unrecorded_ledger_versions')
ON CONFLICT DO NOTHING;
