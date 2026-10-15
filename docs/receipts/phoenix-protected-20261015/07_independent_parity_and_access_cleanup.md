# N26 independent parity, historical delta and temporary-access cleanup

Fresh source/target snapshot: 2026-10-15T06:23:09.435520+00:00. Independent Neon read recomputed every table sorted-row MD5 concatenation SHA256 against original snapshot metadata: 57/57 matching tables, 1270/1270 rows, ZERO differences. This does not rely only on helper success. Actual retained archive byte SHA256 matches aacfe20c43e7fff0b152c6be2a2dc8134bf39d4f734e6cbef6e81838a9623614. All 6/6 restored account rows contain object-valued token envelopes; protected source and target original-key checks TRUE under complete-row guard. Restored schema_migrations count 20.

Historical Oct14 01:00:33.179Z vs fresh Oct15 snapshot comparison: 1259 -> 1270 rows. Changed tables audit_log 789->797 (+8), settings 35->36 (+1), worker_heartbeats 373->375 (+2), sender_health 3->3 with changed content. This proves older archive was stale; it does NOT prove no writes after fresh snapshot. No private row values read or printed.

Cleanup performed and verified:
- Execution gate disabled after success, expiry set to past 2026-10-15T06:23:12Z.
- Render helper env replaced wholesale with ONLY CONTINUITY_EXECUTION_GATE, CONTINUITY_REVIEWED_SHA, CONTINUITY_APPROVAL_EXPIRES_AT. Fresh provider Environment UI independently lists exactly those 3 keys, no source URL, original key, archive key, Neon URLs, secret files or linked environment groups.
- Blueprint exs-db86uguq1p3s739qkujg Auto Sync changed Yes->No, saved; UI explicitly Sync paused.
- Deployment branch render.yaml now removes ALL sensitive native refs/URL/key entries; cleanup commit ca45d171ae65f9f14f873d0a5497a1a4c688a291, blob e0168500958a40039a9c73683a6822d2f3507900 fetched exact. Source execution commit remains immutable 70f2f5f094d3c2fbc707b9c76beb9e918bc7c791; no Python code changed.
- Helper srv-db870egm7kps73daipi0 suspended through exact named provider confirmation; independent connector confirms suspended=user, Free, autoDeploy off, updatedAt 2026-10-15T06:26:57.421655Z.
- Existing archive-key custody helper srv-db78ug59fdbs73da4mrg still suspended/Free; original key remains in original app. Neither original key nor archive key rotated, copied into Git/chat, or deleted from original custody.
- Original PostgreSQL available/Free, ipAllowList=[] unchanged, same expiry 2026-10-16T23:22:29.055606Z. Original app latest deploy still dep-db4h3a9srm7s73b3o040 source 24854739d70617d57807cde5407a84266cca477c. No production app/cutover changes.

Protected backup/restore/key operation COMPLETE. N26 overall remains OPEN for actual isolated held application boot/authenticated API proof and post-snapshot writer reconciliation. Reviewed helper deliberately never starts app, its HTTP200 is constant health, and no fresh reviewed app-start harness is part of protected package. High must prepare that engineering artifact and exact no-send plan; Work returns when a protected binding is actually necessary. Existing current backup must not be blindly replayed into now-nonempty target. No paid services, sends, DNS/security expansion or production cutover; SEND_SET=[].
