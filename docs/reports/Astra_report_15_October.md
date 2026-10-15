# Astra report 15 October

**Date:** 15 October 2026. **Scope:** protected account operations for PHOENIX N26/W26, not general engineering or campaign launch.
**Outcome:** fresh original Render PostgreSQL encrypted backup, independently verified isolated Neon restore and original-key compatibility are DONE. Live application continuity is NOT fully closed: isolated held app boot, authenticated API checks and post-snapshot writer reconciliation remain for High.

## Verified recovery result

| Evidence | Actual result |
|---|---|
| Original source | Render dpg-dali9dbl550s73bcf520-a / uberbond-control-postgres, PG16 Free Frankfurt |
| Source expiry | 2026-10-16T23:22:29.055606Z, unchanged |
| Snapshot/dump observation | 2026-10-15T06:23:09.435520+00:00 |
| Protected completion log | 2026-10-15T06:23:12.030468491Z, VERIFIED_ISOLATED_RECOVERY |
| Isolated destination | Neon misty-moon-35132124 / br-orange-wave-baqrfil7 / uberbond_phoenix_rehearsal_20261014_v2 |
| Tables and rows | 57 tables, 1,270 rows |
| Independent full content verification | 57/57 per-table sorted-row fingerprints MATCH; 1,270/1,270 rows MATCH; zero differences |
| Protected schema/sequence checks | All 13 checks TRUE: tables, columns, constraints, enums, extensions, indexes, policies, routines, schemas, sequences, triggers, views, row fingerprints |
| Restored accounts | 6 total; 6/6 with structured encrypted token envelopes |
| Original token key | Actual source AND restored-target AES-GCM authentication/JSON decoding TRUE across every account under #1425 full-account guard |
| Migrations | 20 restored schema_migrations rows |
| Archive authentication | Encrypted archive decrypt/dump roundtrip TRUE inside protected runtime |
| Independent archive storage verification | Actual stored ciphertext byte SHA256 equals stored archive digest |
| Application boot / replication / cutover | FALSE / FALSE / FALSE; not inferred from successful helper health |
| Mail/model calls | 0 |

**Mission receipt identity:** PHOENIX_CURRENT_SOURCE_ISOLATED_RECOVERY_20261014:eb315475fc6eb2c2439a6da29873f12f

**Archive SHA256:** aacfe20c43e7fff0b152c6be2a2dc8134bf39d4f734e6cbef6e81838a9623614  
**Dump SHA256:** e553beeffb62c3cf6b1fc61e66ebda18c823e484b8309b31b4f6e7568893a387

Archive appended at 2026-10-15T06:23:10.313Z in existing uberbond_render_rescue.phoenix_rescue_archive.backup. Earlier archives and rehearsal databases retained. No ciphertext, connection URL, key, decrypted account data or private row values committed or printed.

## Work performed in this session

1. Recovered founder-linked protected mission, current issue #1188, exact delegation comment 6180051799, helper #1409, independent admission review #1411 and full-account coverage fix #1425. Independently refreshed main at 298bd585d3ba0cf1fe5cdc2f81a525eb67819608.
2. Opened Render and found sign-in required. Used secure browserAuth with owner-selected Google/founder account; verified authenticated My Workspace tea-d96rqhepuehc73et0i40. No sign-in credentials read.
3. Inspected actual narrow Blueprint preview. Found YAML service branch still selected old Work source lacking #1425 coverage. Created isolated helper branch from reviewed #1425 head 694087c36dbd6fc1a443948fa023d4ba293334b0 and changed ONLY the manifest branch reference. No Python/helper implementation changed; no other agent branch overwritten.
4. Committed/read back execution manifest 70f2f5f094d3c2fbc707b9c76beb9e918bc7c791, blob 493582b3be96e1c1575500cfd71b88b9352262a1. Provider preview showed only intended new helper. YAML specified Free Frankfurt, autoDeploy off, exact source DB and individual production-token/archive-key native references, no custody-group import.
5. Independently confirmed v2 target PG16 had zero user relations and zero user routines. Requested action-specific sensitive-access approval only after concrete plan; owner approved.
6. Created Blueprint exs-db86uguq1p3s739qkujg and Free helper srv-db870egm7kps73daipi0. Initial deployment gate OFF. Verified actual source SHA and WAITING_FOR_EXACT_GATE. Passed designated Neon connection values directly between authorized connectors without printing values.
7. Enabled bounded recovery. First attempt safely refused VALIDATE_IDENTITIES at 06:21:12.831216174Z. Immediately disabled gate. Found both Neon URLs used expected pooled endpoint while helper correctly pins direct endpoint. Corrected only known pooled-to-direct hostname. Independently verified target still empty and current-mission archives zero; no uncertain data effect or blind replay.
8. Ran corrected bounded attempt on deployment dep-db872e5g1s2s7399ngr0, exact source 70f2f5f094d3c2fbc707b9c76beb9e918bc7c791. Captured actual successful protected receipt and promptly disabled gate.
9. Independently queried stored archive digest and recomputed restored fingerprints through Neon read-only SQL. Verified all 57 tables/1,270 rows, account envelope coverage and migration count.
10. Compared old archive with fresh source snapshot; recorded real changes below.
11. Removed temporary helper sensitive env/bindings, paused Blueprint automatic sync, removed ALL sensitive refs from branch manifest, suspended helper and independently verified provider state. Kept original source, app, archive custody and all historical backups.
12. Wrote append-only GitHub receipts after material operations, remotely read them back, and updated/read issue #1188. This report is a record of actual session work; it does not claim other chats' engineering or outreach was executed.

## Actual historical delta

The old archived dataset was at 2026-10-14T01:00:33.179Z with 1,259 rows. The fresh snapshot has 1,270. Four tables differ:

| Table | Old rows | Fresh rows | Content |
|---|---:|---:|---|
| public.audit_log | 789 | 797 | Changed, +8 rows |
| public.settings | 35 | 36 | Changed, +1 row |
| public.worker_heartbeats | 373 | 375 | Changed, +2 rows |
| public.sender_health | 3 | 3 | Changed content, same count |

This confirms the old backup was stale. This is a historical-to-fresh comparison, NOT evidence that no writes occurred after the fresh snapshot.

## Cleanup and custody

- New helper srv-db870egm7kps73daipi0: independently confirmed suspended=user, Free, autoDeploy off, provider updatedAt 2026-10-15T06:26:57.421655Z.
- Helper environment independently inspected in provider UI: ONLY CONTINUITY_EXECUTION_GATE, CONTINUITY_REVIEWED_SHA and CONTINUITY_APPROVAL_EXPIRES_AT remain. No source connection, production token key, archive key, Neon URLs, secret files or linked groups.
- Gate disabled and expiry moved to past 2026-10-15T06:23:12Z.
- Blueprint Auto Sync Yes->No saved, provider UI says Sync paused.
- Cleanup manifest ca45d171ae65f9f14f873d0a5497a1a4c688a291, blob e0168500958a40039a9c73683a6822d2f3507900 independently fetched; no sensitive fromService/fromDatabase/fromGroup refs or URL/key entries remain.
- Old archive custody helper srv-db78ug59fdbs73da4mrg remains suspended/Free. Existing archive key preserved there; original token key preserved in original app. Neither original custody secret rotated/deleted.
- Original PostgreSQL independently re-read AVAILABLE with ipAllowList=[] and unchanged expiry.
- Original production app latest deployment remains dep-db4h3a9srm7s73b3o040 / 24854739d70617d57807cde5407a84266cca477c. No production app deploy/env/start command modified.

## Repository checkpoints

Receipt branch: work/astra-protected-n26-20261015-0620. Paths below are under docs/receipts/phoenix-protected-20261015/. Each receipt file was remotely fetched before its issue checkpoint.

| Receipt | Commit | Issue #1188 comment |
|---|---|---|
| 01_render_auth_and_source_recovery.md | a7e2293a75d57fec006239ab53db52a2ef642da2 | 6185751041 |
| Manifest exact reviewed source binding | 70f2f5f094d3c2fbc707b9c76beb9e918bc7c791 | 6185764586 |
| 02_narrow_provider_plan_ready_for_scoped_approval.md | f4a81870cd7e577c9b7dc9f6152aa1810050b430 | 6185802745 |
| 03_approved_helper_created_gate_off.md | 6ef6a69b32d9851f2d0cd9e414c47792bcff1e86 | 6185852534 |
| 04_single_bounded_recovery_started.md | b2423a38b29c50e34711989bf4e4c78f80e04814 | 6185869296 |
| 05_identity_refusal_corrected_no_data_effect.md | 000f0362f5c5285a093ea321187a857bf1268449 | 6185888886 |
| 06_current_source_encrypted_recovery_verified.md | b7ff5f058f4fdd78be2df065c05dc100164374ce | 6185918659 |
| 07_independent_parity_and_access_cleanup.md | a7b7c48c29b71f1f0d0b6650c9b7fa2acec6ff4e | 6185968648 |

No main merge or broad CI run performed. Reviewed #1425 prior hosted 15/15 tests are inherited evidence, not newly rerun tests. Actual provider backup/restore/crypto and independent SQL evidence are the new validation.

## Exact remaining High handoff and one-writer proposal

N26 current-source preservation/key-compatible isolated restore is proven. N26 full live continuity remains OPEN.

**Concrete engineering dependency:** reviewed helper explicitly never starts the application; Docker context contains only recovery tooling. It exposes constant HTTP health, not authenticated UberBond API. There is no reviewed full-app held-boot artifact in this protected package. High must provide an isolated probe of actual chosen app source with worker/outbound/model effects disabled and fail-closed startup; read-only runtime credentials/transaction enforcement; actual authenticated API/operational query checks; and key-compatible protected binding requirements. Do not treat helper HTTP200 or crypto boolean as app boot. Work returns only when that exact protected binding is required.

**One-writer proposal, NOT executed or authorized cutover:**
1. Retain the original production app/DB as the only current writer; keep restored target isolated from all production writers.
2. High verifies held app probe and migration compatibility against fresh restored state without enabling workers or messages.
3. Before any future cutover, prepare a separately scoped reversible writer quiescence at the original service, verify all source writers stopped, capture final consistent delta/snapshot into a NEW empty destination, and compare exact schema/rows/sequences/key/API again. Current v2 is nonempty; DO NOT replay this helper into it.
4. Exact post-06:23:09 source deltas are UNKNOWN; do not extrapolate the +11 historical-row difference into the final delta.
5. Present separate exact cutover/rollback approval: source/target IDs, app SHA, old/new protected DB bindings, one active writer, held outward effects, verification and rollback conditions. Preserve original service/DB/archives; do not delete or retire original source.
6. If rollback becomes necessary after writes on the new writer, stop that writer and reconcile its new writes before routing back. Never create two divergent writable production copies.

**Still excluded:** production cutover, source retirement, source allowlist expansion, paid services, campaign launch/import/seed sends without their separate current reviewed gates. W10/W13 are not started: mission permits them only after High certifies current source/import admission and scopes a protected action. No such certification was supplied in this session. SEND_SET=[].

The owner has a fresh recoverable dataset before expiry; continued live service beyond source expiry still requires the remaining held-app/final-writer/cutover work above.
