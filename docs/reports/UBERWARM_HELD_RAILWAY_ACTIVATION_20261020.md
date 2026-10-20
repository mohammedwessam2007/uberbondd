# Owner-approved held Railway baseline and callback — 2026-10-20

Owner explicitly approved activating the verified October15 recovery as a held no-send baseline at 03:09 Cairo. This is NOT evidence newer records were recovered or outbound was cleared.

## Executed baseline cutover

- Copied three current operational tables into the recovered database without overwriting any existing table. Source and target independently matched: 658 journal receipts (MD5 a654e8036a5a122f437004b0f6d1588e); one encrypted receiver binding (MD5 bd00cc4d012300c33cf7783a70728055); zero one-shot claims.
- First deployment895aebc9 failed closed because existing migration scripts require database name railway. No guard was removed.
- Verified both databases had zero active sessions and archive destination was absent. In one PostgreSQL transaction, renamed original railway to railway_operational_precutover_20261020 and recovered phoenix_control_oct15_20261019 to railway. Both ALTER DATABASE operations committed. No database/table/record deleted; original database retained under archive name.
- Reset runtime DATABASE_URL to its existing Railway-managed Postgres reference (no raw credential export). OUTBOUND_ENABLED=false, OUTBOUND_DRY_RUN=true, UBERWARM_SEND_ENABLED=false, UBERWARM_RECOVERY_DATA_CURRENT=false.
- Current railway has61public tables, six historical accounts, zero historical suppressions, all copied operational state and zero claims. Historical absence is not a current suppression clearance.
- Deployment28414b86-c933-4c12-aeae-c45692eca373 SUCCESS at00:16Z, source f4f95d566987d443d169905a122a0cd44e1175b5. Existing journal and receiver migrations passed unchanged; encrypted receiver authenticated with read-only access, messagesRead0, sends0.
- Existing unrelated staged patch734694ef (6changes) was not applied. No new subscription, paid warming, sending or customer payment.

## Callback source and verification

railway-entry.mjs reuses existing Fetch handlers from the isolated callback sidecar; index.tsx is its esbuild0.28.2 MIT bundle with only pg imports pinned to8.22.0 (same version tested locally). It has no send path. Every database connection independently verifies exact railway primary plus canonical suppression/event tables before writes. Health discloses booleans and the historical no-send boundary, not credentials or recipient data.

Run node scripts/verify-uberwarm-railway-callback.mjs against disposable PostgreSQL only. It checks HTTP health, raw HMAC acceptance and replay, unsigned401, wrong-binding503, non-mutating GET unsubscribe, durable POST unsubscribe and404. It never contacts a real mailbox. Pool cleanup and idle-error handling do not expose connection objects.

Deployment/provider registration must still be independently verified; this source receipt alone is not a live callback or an actual provider bounce/complaint. Vercel account remains blocked. Expired diagnostic consent is not reusable.
