# PHOENIX TRIDENT W — controlled-cutover package
Observed 2026-10-13 20:55 UTC. Prepared, NOT APPROVED FOR EXECUTION.
No production migration is complete.

## Bound identities
- Production application: Render srv-dali9vijnfac739m4vcg, deployed 24854739d70617d57807cde5407a84266cca477c, deploy dep-db4h3a9srm7s73b3o040.
- Current main: 298bd585d3ba0cf1fe5cdc2f81a525eb67819608.
- Claude PR1404: draft, observed head 1cd3d43394e47fae595437b755156986ada8502f. Engineering owner must close documented CRITICAL/HIGH failures and provide exact-head evidence.
- Source: dpg-dali9dbl550s73bcf520-a, internal host same, port5432, DB uberbond_control_postgres, PG16 Frankfurt.
- Candidate destination: Neon misty-moon-35132124, br-orange-wave-baqrfil7, DB uberbond_render_rescue, direct host ep-soft-cake-baiahh8q.c-8.eu-central-1.aws.neon.tech, PG16.15. Protected credentials stay provider-side; do not place connection URLs in this repository.
- Latest rehearsal DB: uberbond_trident_rehearsal_20261013, isolated from restored baseline and production.
- Existing TOKEN_ENCRYPTION_KEY stays protected on production; never rotate it during database cutover.

## Verified recovery assets
Original snapshot dump ba643e2545cd141134575565e71ca3c7bed6cf63f0622fd69202fda9eb6535a0, archive ce8fc45bbe2012645b2670e3fdef427b4903b70a53d64cde610b2c8c052144b5.
Latest snapshot at 20:47:13 UTC: dump b95cc861dbf3a09c7a2d54580fc332b8f7b34caead75baf4f73733008e197dea; archive a3665aa515092323cb9fa466ed61fb6806122953d76ccd4e9a05787e718e3025; 57 tables/1259 rows.
Latest archive mission PHOENIX_TRIDENT_READONLY_COMPARE_AND_LATEST_BACKUP:1f66236749e9cafb in phoenix_rescue_archive.backup. Original archive remains a separate row and private Library file.
Independent helper-free key custody: unlinked protected Render group evg-db79asqd0e5s73foiu1g, RESCUE_ARCHIVE_KEY. Rehydrated key equality and original authenticated decryption/dump comparison verified.
Backup key appeared in private Work tool output due Render copy/reveal behavior. No public artifact contains it; do not assert zero exposure. Original recovery material is retained. Protected re-encryption/replacement should be completed before sharing any archive.
Latest isolated restore verified at20:52:06Z: all14 catalog/fingerprint/sequence checks true,20 migrations,6 encrypted account rows.
Roles/ACLs preserved in dump and role metadata; restore uses designated Neon owner with --no-owner/--no-privileges. Application-role privilege mapping still needs review.

## Cutover admission: ALL must pass
1. Engineering delivers one reviewed, immutable sourceSHA, compatible schema/migrations, no auto-send/canary/resume, and rollback-compatible changes. PR1404 is not admitted now.
2. Trusted isolated application boots against a freshly restored DB; startup, actual store queries, admin authentication refusal/success, original-key decryption and read-only UX pass with no external calls. NOT YET VERIFIED.
3. Provider-native secure key injection approved/available. Show-secret transfer rejected by automatic review; no production key was read or copied.
4. Dedicated production destination has independent final restore evidence and role permissions, direct migration connection and suitable runtime connection. Pooling/session behavior must match application store. Require TLS with certificate validation and bounded pool; don't infer suitable settings from provider default.
5. Founder approves exact source, DB target, maintenance window, write-freeze, final backup and DATABASE_URL switch. Mission W specifically excludes cutover authorization.
6. Destination Free limits checked against data, connections, compute and availability requirement. Current0.25CU/1GB/6h retention is observed; this does not certify 24/7 production suitability.

## Proposed window / freeze, not scheduled
Target readiness review by Oct15 18:00UTC. Proposed30-minute cutover only after admission; latest safe decision deadline Oct16 18:00UTC, before source expiry Oct16 23:22:29UTC.
Freeze EVERY writer: web/admin mutations, worker/scheduler, reply poller, inbound webhooks, import jobs and any independent client. Disable queue dispatch and automated sends. Provider webhook arrivals need durable buffering and later idempotent reconciliation. A read-only backup does not freeze writers.
Do not rely solely on application flags. Capture existing config privately, require DB write connections/transactions to be absent and admission tests to prove mutation refusal. If full write-freeze cannot be demonstrated, stop.
Take final consistent READ ONLY/REPEATABLE READ exported-snapshot dump, retain roles/ACL/extension metadata, encrypt, authenticate, restore into a new empty candidate destination, verify every table fingerprint/catalog/sequence.
The20:47 snapshot is NOT a final cutover snapshot. Production writes after it are an explicit synchronization gap.

## Exact switch and health
Preserve old protected DATABASE_URL and old deploy in an approved secret store before any switch.
Change only production DATABASE_URL to reviewed protected destination setting; keep TOKEN_ENCRYPTION_KEY unchanged. Deploy only reviewed sourceSHA after approval; autoDeploy staysOFF.
Keep all50 Startup senders held and all original pilot quarantine/ciphertexts unchanged. G-SPOT dispatcher and all mail effects remainOFF.
Verify live deployment SHA, /health-equivalent approved endpoint, store backend/read health, migration counts, six pilot-account ciphertext decryptions, account authorization checks, mutation gates, scheduler leases, and aggregate business/effect ledgers. Do not test by sending.
One writable database may be active at a time.

## Rollback
Before destination writes: restore prior protected DATABASE_URL and exact prior Render source; independently prove source connectivity/health, pilots and gate invariants.
After any destination write: immediate switch-back would LOSE new data. Freeze both sides, snapshot destination, reconcile/import accepted new effects and idempotency ledgers, verify fingerprints, then approve rollback. Never blindly replay ambiguous sends/payments.
Additive migrations may remain; destructive schema rollback is prohibited without separately reviewed compatibility proof.
Retain Render source until accepted cutover and rollback window are complete. Never delete source or last archive.

## Database-only paid contingency
Dashboard independently shows smallest0.1c-256mb compute at USD6/month.1GB retained disk observed. All-in storage/tax/proration checkout NOT verified; do not quote6 as final total. Preview canceled; no purchase.
If admission is still blocked at safety deadline, request explicit exact database-only upgrade approval after final quote. Web compute upgrade is a separate decision. No silent charges.

## Winnr architecture interface
Official Winnr documents GET mailbox/unified inbox and POST /v1/email-users/{user_id}/inbox/send over HTTPS, signed webhooks/message-ID lookup; Startup300requests/minute, exports one per5seconds. API access included in current plans. Provider-native submission is genuinely documented, but no production call was made.
Prefer HTTPS native Winnr adapter over SMTP for a bounded permitted workload if provider/account authority/schema/idempotency are verified. Render Free SMTP465/587 is blocked; no tunnel fallback. Free sleep means no24/7 polling guarantee.
Render AUP prohibits unsolicited bulk/other unsolicited messages; moving SMTP toHTTPS does NOT resolve that policy. Cold dispatch from Render remainsBLOCKED. No alternate paid host purchased; existing authorized compliant persistent runtime not established. Provider/legal written clarity and recipient/exact-effect gates required before dispatch.
Use read-only access for registry/holds. 50SMTP+50IMAP authenticated on Actions proves only that bounded test, not production import, holds, reputation or legal eligibility.
Sources checked Oct13: https://render.com/docs/free https://render.com/acceptable-use https://winnr.app/help/api-mcp/api-intro.html https://winnr.app/help/api-mcp/api-endpoints.html https://winnr.app/terms-of-service.html
