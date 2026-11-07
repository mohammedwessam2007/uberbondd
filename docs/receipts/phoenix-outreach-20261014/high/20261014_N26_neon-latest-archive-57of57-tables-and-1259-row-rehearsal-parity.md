# PHOENIX H N26: independent actual Neon Titan rehearsal parity against latest archived source inventory

**Observed 2026-10-14 UTC.** N26 backup RECOVERY SUBGATE improved; full current writer/production continuity still OPEN.

## Strict provider evidence
1. Independently read-only queried original archive database `uberbond_render_rescue` in Neon project `misty-moon-35132124`, branch `br-orange-wave-baqrfil7`:
`SELECT f->>'schema', f->>'table', (f->>'rows')::int FROM phoenix_rescue_archive.backup b CROSS JOIN LATERAL jsonb_array_elements(b.receipt->'source_fingerprints') f WHERE b.created_at=(SELECT max(created_at) FROM phoenix_rescue_archive.backup) ORDER BY 1,2`.
Latest stored snapshot receipt timestamp: **2026-10-14T01:00:33.179Z**, **57 source table records**, **1,259 source rows**.
2. Independently queried exact **isolated Titan rehearsal database** `uberbond_titan_rehearsal_20261014` in the same Neon project/branch: for each of those 57 source-recorded schema/table identifiers, executed a read-only isolated `SELECT count(*) FROM ONLY "schema"."table"`, quoting identifier components, with one UNION ALL query.
3. Compared all resulting 57 Neon rehearsal row counts with source receipt by exact schema+table identity in memory: **57/57 table counts MATCH, 1,259/1,259 total records MATCH, 0 missing tables, 0 mismatched row counts.** This is new real provider readback, not a fixture or an assumed manifest number.
4. Separately previously verified all **three** persisted encrypted backup objects' SHA-256 over actual stored bytes match their archived hashes; original October 13 rescue receipt reports TRUE schema/catalog/row fingerprint/decryption checks for its own historical snapshot.
5. The actual Titan rehearsal `public` catalog contains **57 tables**, and an independent aggregate check found 6 encrypted account envelopes, consistent with corresponding source snapshot counts; no credentials or encrypted ciphertext content retrieved.

## Important truth boundary
- **This proves latest archived source-reported table-row COUNT parity against isolated restored Neon Titan.** It DOES NOT prove all table bytes/fingerprints equal, original Render source has made zero subsequent writes, original credential/encryption-key decrypts restored records, or restored application boots successfully.
- The original Render Free PostgreSQL remains available but has safe empty external allowlist; connector access blocked; expires **2026-10-16T23:22:29.055606Z**. The latest archive capture is Oct14 01:00 UTC, hence potentially stale and cannot replace source-current protected backup.
- Access to the prepared Work helper requires provider-native secure cross-service references unavailable in installed Render tool; must use authorized Work Cloud Browser/Render Dashboard. No live source query was falsely claimed.
- No database writes, restores, snapshots, network changes, new fees, sends or production cutover were performed by this parity check.

**N26 next:** exact scoped helper admission → fresh original source snapshot+encrypted archive → isolated restore → aggregate original-key and full content/sequence/catalog proof → app boot and writer delta/rollback. Deadline Oct16 23:22 UTC.

**Repository provenance:** Work PR #1409 and original three archive receipts. This new independent check is append-only evidence, not an override of those prior receipts.
