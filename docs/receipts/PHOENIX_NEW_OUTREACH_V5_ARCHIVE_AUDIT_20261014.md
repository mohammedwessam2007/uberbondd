# PHOENIX new outreach stack launch audit | 2026-10-14

Scope: newer native Lead OS, 50 Winnr Startup mailboxes on 10 domains, three separate pilot mailboxes, UberWarm2-6, UberDoso, SMTP/IMAP, replies and guarded campaign activation. This is not the historical MVP.

Original supplied archive: V5 2026-10-11 ZIP, sha256 dcf18cb89675f82268e3104f95b7c64e11fa460ecf3b2b9162eba215b706c837. ZIP CRC passed. All 1312 declared manifest member hashes and sizes matched. 890 numbered founder-idea source files present. 1293 text files indexed into 166462 exact line hashes; 20 embedded PDFs with 13234 extracted page text hashes. This establishes byte coverage, not review of every historical code change or proof of a live customer outcome. Archive's “Startup not purchased” statement is superseded by October 14 provider evidence.

Current checked GitHub main 298bd585d3ba0cf1fe5cdc2f81a525eb67819608; newer integration #1405 draft f87a107c91a8fe8ada84c47fc16fa1f2cc774c1e, 295 changed files, unmerged. Actual Render app still on older 24854739d70617d57807cde5407a84266cca477c. Authenticated fleet last reported 50 Startup accounts plus 3 pilots with no paid warming enrollment. Historical Startup 50 SMTP and 50 IMAP auth passed, but no proof of current production import, inbox placement, or cold send authority.

Thirty present-day acceptance gaps are tracked in the separately supplied audit pack (N01-N30). Critical release gates:
- P0 Render Free PostgreSQL source expires 2026-10-16T23:22:29Z: isolated Neon backup proven, fresh source delta, original key application restore and safe continuity remain open.
- P1 PR #1405 hosted CI: deterministic run 38568111615 10966 pass/1 fail/63 skipped, stale canonical readiness; Postal run 38568111601 shows actual whitespace at tests/fixtures/retired-startup-guards/r3-candidate-reconciliation.txt:156. Recheck newest head before any changes.
- P1 confirmed source bug: sending-mailbox-registry.mjs and sending-domain-registry.mjs load oldest 1000 type events before identity filtering; fleet list paths truncate at 5000. Latest identity holds may disappear at scale. Adversarial fix requested in PR #1405 comment 6171240273.
- P1 current provider daily send limits 50 per each of 53 identities do not equal proven provider-side protective holds. Local outbound stays blocked. Winnr write-scope protective cap action not available through known read-only token.
- P1 protected import 50 Startup identities into source production with same existing encryption key not proved; preserve 3 pilots, no send, default paused; verify 50+3.
- P1 UberWarm2-6 source/test layers awaiting real activation, distinct consenting receivers, fresh provider signals and actual inbox observations. No artificial engagement or $30 paid warming addon.
- P1 newest Lead OS 24 signal types, native discovery/search-to-list, hygiene, lookalikes, V5 proof-personalization and governed sequences have source implementations. Not proven: 65 independent filter parity, large eligible real list, live end-to-end campaign handoff and one-click production adoption.
- P2 current verified contact route, jurisdiction/provider legality, exact sender/message/batch approval, no replay, independent receiving and reply audit; no campaign yet.
- P3 cleared contribution and accepted customer delivery remains unverified.

Do not hide status behind test counts: SOURCE, TEST, DEPLOY, PROVIDER, EXTERNAL, CLEARED CASH are different evidence classes. Do not merge, deploy or send based on this review. Protect database; Claude owns active #1405; GPT Work owns safe provider/account integration. Preserve progress in issue #1188, with no secrets.
