# PHOENIX N26 | independent historical recovery fingerprint parity

**Observed:** 2026-10-15 ~00:12 UTC. READ-ONLY Neon checks, not original live Render connectivity.

## WE HAVE DONE
- Fetched the most recent retained encrypted archive's `receipt.source_fingerprints` from Neon `misty-moon-35132124`, database `uberbond_render_rescue`. The archived snapshot creation timestamp is **2026-10-14T01:00:33.179Z** and contains exactly 57 table fingerprints.
- Independently used `mcp__Neon__run_sql` against the isolated restored `uberbond_titan_rehearsal_20261014` database. For each source table, constructed a quoted-identifier SELECT on `ONLY schema.table` computing count and `encode(sha256(convert_to(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), ''),'UTF8')),'hex')` to match the declared `sorted_row_md5_sha256` normalization. Joined all 57 with UNION ALL and compared exact digest and integer count in memory. No raw rows or account credentials retrieved or logged.

## VERIFIED
- **57/57** expected source public tables found in rehearsal.
- **57/57** exact sorted-row SHA256 fingerprints match the historical snapshot, **0 mismatches**.
- **1,259/1,259** rows match expected per-table and total counts, **0 missing tables**.
- Previously independently verified **3/3 encrypted archive SHA256** bytes matches stored SHA256 in rescue table. Archive integrity and historic rehearsal parity are two different proof types; both are now evidenced.

## WHAT IS LEFT
Critical truth boundary: the fingerprints are the **2026-10-14 01:00Z SOURCE SNAPSHOT**, not Render source-current writes; account encryption key compatibility, completeness of nonpublic schema/roles/extensions and restore application boots remain unknown. Render source PG16 Free expiry **2026-10-16T23:22:29.055606Z**. No fresh production backup, cutover, or original key assertion is inferred. Rescue archive is historical and a verified isolated rehearsal, not a guaranteed current production replacement.

## NEXT
Protected provider-native Render original-key/source-bound fresh consistent backup; archive and restore to existing empty isolated Neon v2 database; run same exact-row fingerprints, original key roundtrip, app startup and delta, independent no-cutover and rollback proof. Work protected account UI ONLY if connected native provider APIs cannot provide secure access; do not relax source database IP allowlist.

**SAFETY:** no provider writes, credentials, email, network/DNS changes, charges, deploy or cutover. SEND_SET=[].
