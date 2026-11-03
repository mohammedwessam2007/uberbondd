# PHOENIX MONSTER H: N08 history truncation independent baseline

**UTC checkpoint:** 2026-10-14 15:35Z. **Agent:** GPT-6 High. **Authority:** isolated source assurance and no-send engineering only.
**Verified remote main:** `298bd585d3ba0cf1fe5cdc2f81a525eb67819608`.
**Claude #1405:** head `f87a107c91a8fe8ada84c47fc16fa1f2cc774c1e`, draft, 295 paths. Neither registry source file is in Claude's changed-file list; all other #1405 source remains Claude-owned. No rewrite, merge or deployment performed.
**Audit #1407:** N08 review-only source finding and 30-gate ledger read.

## WE HAVE DONE
Direct source read from exact #1405 head independently confirms:
- `src/sending-mailbox-registry.mjs` contains `loadMailboxEvents` querying oldest first `auditLog` records with type-only filter, limit 1000, then identity filtering; fleet list uses 5000.
- `src/sending-domain-registry.mjs` repeats the same type-first 1000/5000 truncation.
- `JsonStore._listDirect` and `PostgresStore.list` apply limit after type filter and accept no-limit list, so later safety events can be omitted. This is **SOURCE_PRESENT source-path counterproof**, not a live exploited send.
- Reviewed existing #1405 prior independent comment 6171240273 and root store interface; this exact issue remains in #1405 head. GitHub branch created exclusively for independent N08 repair and tests.

## WHAT IS LEFT
N08: eliminate unsafe oldest-first limits without hiding incomplete history, preserve deterministic ordering and fail-closed on possible partial reads. Add >1000 identity and >5000 fleet negative tests, exercise JsonStore and real PG if runner available, confirm exact CI and readback. Other N01–N30 gates are not certified by this step. Claude owns #1405 wider source.

## Evidence boundaries / safety
No SMTP/IMAP or Winnr probe, cold send, provider cap changes, DNS writes, database cutover, billing, main merge or deploy. All sender holds unchanged. Provider real-world evidence still UNKNOWN. Historical 50/50 auth cannot stand in for inbox placement.

**Next action:** Implement targeted, independent N08 patch on these two untouched registry modules with adversarial tests, without editing Claude #1405 or store.mjs.
