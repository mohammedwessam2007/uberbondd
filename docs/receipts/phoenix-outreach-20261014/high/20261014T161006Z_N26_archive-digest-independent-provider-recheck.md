# PHOENIX H | N26 | Independent Render/Neon continuity evidence

**UTC observation:** 2026-10-14T16:10:06.949Z
**Provenance:** authenticated Render and Neon connector metadata; actual read-only SQL over selected rescue database. No secret values or personal records retrieved.

## WE HAVE DONE
- Refreshed Render source PostgreSQL `dpg-dali9dbl550s73bcf520-a`: PostgreSQL 16, Free, status `available`, external allowlist empty. Expiry **2026-10-16T23:22:29.055606Z**. No connection or networking setting changed.
- Attempted one read-only source query (`count/max(audit_log.created_at)`); Render connector refused it because empty external allowlist prevents server-side query. Current source write frontier therefore **UNKNOWN**; do not equate the rescue copy with current source.
- Refreshed Neon rescue project `misty-moon-35132124`, branch `br-orange-wave-baqrfil7`, database `uberbond_render_rescue`: branch `ready`, PostgreSQL 16, snapshot API returns zero native snapshots. Independently enumerated actual application tables and dedicated `phoenix_rescue_archive.backup` table; native snapshot absence does **not** imply no separately stored archives.
- Executed read-only aggregate with PostgreSQL 16 built-in SHA-256: `bool_and(encode(sha256(archive),'hex')=lower(archive_sha256))`. Result: **3/3 stored archive byte digests match**, 3 distinct archive digests, total 1,157,630 stored bytes. Earliest archive 2026-10-13T20:11:51.811Z; newest **2026-10-14T01:00:33.179Z**.
- Separate public rescue `audit_log` aggregate: **785 rows**, latest event timestamp **2026-10-13T16:09:36.476Z**. These are copied-state observations only; they do not reveal current source table counts.

## VERIFIED RESULT
**Proof class: PROVIDER_READ, PARTIAL.** Archive-at-rest byte integrity was independently verified in the rescue database on the above dates. This is **NOT** proof of dump-internal integrity, restoration under the original encryption key, full schema equivalence, current source-delta coverage, writer cutover, recovery point objective, or application operation. No production backup/write/cutover executed.

## WHAT IS LEFT / N IDs
- **N26 BLOCKED ON TRUSTED SOURCE ACCESS:** obtain Work's live original-source latest-write checkpoint through existing protected runtime (no open external database access), then reconcile after 2026-10-14T01:00:33Z writes; verify protected latest backup, isolated original-key decrypt/restore and app compatibility before original Free expiry. Avoid destructive/production cutover without exact approval.
- **N13, N25:** rescue public state and archive are not proof the 50+3 provider identities were imported or that new source is deployed.
- **N24:** still requires exact release merge-head hosted CI and deploy-gate checks.

**SAFETY:** Sending HOLD; no public PG allowlisting; no new charges, account changes, mail, merge or deployment. Branch receipt is the only intended write. Independence limit: source DB contents could not be queried from this connection.
