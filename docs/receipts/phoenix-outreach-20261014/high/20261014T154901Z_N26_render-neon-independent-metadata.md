# PHOENIX H | N26 | independently observed production-rescue metadata, read-only
**Observed:** 2026-10-14 around 15:43–15:49 UTC. **Proof class:** authenticated PROVIDER_READ only. No database change/backup created in this step.

## WE HAVE DONE / PROVIDER OBSERVATION
- Render `uberbond-control-postgres` ID `dpg-dali9dbl550s73bcf520-a`: status **available**, Free plan, not suspended, expires **2026-10-16T23:22:29.055606Z**.
- Render `uberbond-control-plane` service `srv-dali9vijnfac739m4vcg`: not suspended. Render deployments API returned latest LIVE deploy `dep-db4h3a9srm7s73b3o040` from actual git `24854739d70617d57807cde5407a84266cca477c` at 2026-10-09 16:10:23Z. This is older than main and Claude/High branches. Not Lead OS integration deployment proof.
- Direct read-only Render PG query was refused: the external IP allowlist is empty; hosted Render MCP has no allowlistable static IP. No access restriction changed.
- Connected Neon rescue project `misty-moon-35132124`, database `uberbond_render_rescue`: currently 57 public tables, 785 audit rows (latest audit event 2026-10-13 16:09:36Z), 6 `accounts` rows, 3 `sender_health` rows, 0 `leads` rows, 6 `campaigns` rows. This describes ONLY the isolated rescue snapshot, not live source.
- Neon `phoenix_rescue_archive.backup` contains THREE nonzero bytea archives, sizes 385809 / 385914 / 385907 bytes (total 1157630). Latest archive row timestamp 2026-10-14 01:00:33Z; historical two rows 2026-10-13 20:11:51Z and 20:47:15Z. Hash columns are populated. No raw archive or secrets retrieved.
- This verifies backup storage and a restored schema, NOT latest-delta continuity, original secret/key decryption, recipient/credential completeness, live dual-write/cutover, or rollback. Current protected full fleet import is NOT proved by 6 rescue accounts.

## WHAT IS LEFT N26
Urgent: Work must obtain current source write freeze/incremental delta under narrowly scoped access from trusted client, original-key compatibility test, full idempotent restore+row-count/foreign key/contract checks on separate copy, backup restore receipt, explicit writer selection/rollback and reviewed cutover authority. DO NOT publicly open PG or casually rotate old encryption key. October 16 expiry is a hard deadline.
**BLOCKER:** source database not directly queryable from this read-only remote agent due to empty allowlist. This does not prove source is unavailable to trusted Render-internal Work process. Do not assume safe live migration from these snapshots.
**SAFETY:** no mutation/backup created/prod cutover/send/billing.
