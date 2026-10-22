# PHOENIX Monster H N08: complete history source patch (UNTESTED, reviewer hold)

**Source branch:** `high/phoenix-monster-h-n08-history-20261014` based on live `main 298bd585d3ba0cf1fe5cdc2f81a525eb67819608`.
**Evidence cutoff:** 2026-10-14 15:40Z. **PROOF CLASS:** SOURCE_PRESENT + remote blob readback; **NOT** TESTED_SHA/CI/production.

## WE HAVE DONE
- `src/sending-registry-complete-history.mjs` new generic audit reader. Verifies type, total typed count before and after one complete ordered read; fails closed on missing count, race/partial result, malformed record, and >100000 typed rows. Sorting is deterministic and PAUSED/RETIRED outrank RESUMED in tied createdAt windows. No live send route touched.
- `src/sending-domain-registry.mjs` single and fleet list now use the complete-history reader (not old 1000/5000 LIMIT). Remote blob `b16ccc11bf7bcf53709e932e5344a7247599c475`.
- `src/sending-mailbox-registry.mjs` single and fleet list now use the same reader. Remote blob `b569006c6707a178b1abcd408214de11e90f2657`.
- New `tests/sending-registry-complete-history-n08.test.mjs` with 3 Node test cases, including real JsonStore >6100 interleaved events per registry, late PAUSED holds, single/list readers, injected partial history/race/overflow/malformed/no-count cases, and deterministic tie safety. Test blob `41f0b9ebcc6af1978a5086ddde8944019692788d`.
- Source commits: helper `504fb239900cb0bb8b38e6d4cf03b480ad532491`; mailbox `dc55269953fcf92e7aeb4145c0c32e900d498d5d`; domain `f1e755df88ec5903de356bf700e5a45e57d54b56`; tests `cf32ca688096efddbb26fdc9dabd28f7b37b93fa`.
- All four modified/new paths fetched back from remote branch. Structural inspection confirmed no historical 1000/5000 type-before-identity limits remain in either registry module.

## WHAT IS LEFT / falsification requirements
**N08 remains OPEN** until actual test run on exact SHA, negative tests, full regression/PG integration, hosted CI and peer review. The new reader scans a whole typed history with a 100k safety ceiling, not indexed JSONB per-identity querying: measure performance and preferably replace with verified indexed identity reads once schema owner agrees. A READ COMMITTED count sandwich detects many but not all possible concurrent insert/delete races; do not claim serializable event history. Protect send-time hold race separately N10/N22.
**N01–N07, N09–N30** are not certified by this patch. Owner Work still holds external billing, provider, database rescue. Claude retains all 295 #1405 paths. No deployments, actual provider changes, cold messages, billed service or original DB mutation.

## NEXT ACTION
Create isolated DRAFT PR to run hosted CI. Assess exact workflow result and repair actual red failures, including any source/merge reconciliation with Claude. Coordinate overlap in #1188. Sender state stays HOLD, zero additional charges.
