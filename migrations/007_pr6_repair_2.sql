BEGIN;

-- PR #6 second-pass repair, item 4: content_hash was previously computed from signalKey/record id
-- (a placeholder, not real evidence content), which meant it carried no actual content-identity
-- information. signal_key is now stored as its own column (the ChatGPT Work batch's own dedupe
-- signal, distinct from evidence content) so it is never conflated with content_hash again.
ALTER TABLE source_evidence ADD COLUMN IF NOT EXISTS signal_key text;

INSERT INTO schema_migrations(version)
VALUES ('007_pr6_repair_2')
ON CONFLICT DO NOTHING;

COMMIT;
