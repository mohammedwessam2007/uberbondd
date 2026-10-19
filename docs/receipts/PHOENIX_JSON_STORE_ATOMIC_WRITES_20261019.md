# PHOENIX Vercel JSON-store atomic write repair | 2026-10-19

**Truth class:** Source implementation and reproduced local runtime test, not hosted production deployment.

## Failure on hosted exact-head PR #1469
- Previous PR source head: `0ff4031e5b6b4a967b9be8a2f8f0cb594b3735c4`.
- All four GitHub Actions workflows PASS on this exact head.
- The `uberbondd-lite-private` preview `dpl_GagRSm8Zee1dT6axTkjhAFYrgiTz` = READY.
- The primary `uberbondd` preview `dpl_2eTx3FnfWZmyTbhKbaz1iMVcB2Lf` = ERROR with `BUILD_UTILS_SPAWN_1` after 10,224 passing tests, 56 skipped, 1 failed: `tests/claude-mcp.test.mjs:261` expected real relay task status `QUEUED`, got undefined. Node logs show `ENOENT: no such file or directory, rename '/tmp/uberbond-mcp-e2e-.../db.json.tmp' -> '/tmp/uberbond-mcp-e2e-.../db.json'` at `src/store.mjs`.
- The store used the same `db.json.tmp` name across concurrent saves, causing one operation to rename the other's temporary file, leaving the other with ENOENT and an HTTP 500. No token, password or customer interaction was involved; this was a localhost e2e fixture.

## Minimal repair
- Every `JsonStore.save()` uses an exclusive private temp file `<db.json>.<pid>.<crypto.randomUUID()>.tmp` with mode `0600`, atomically renames it to `db.json`, and clears temporary data in `finally`.
- Store transaction ordering and rollback behavior are otherwise unchanged. This is an in-process atomic-file collision fix, **not** proof of cross-process serializable transactions; production multi-writer distributed workloads should use PostgreSQL.
- New source regression `tests/json-store-atomic-saves.test.mjs` exercises two independent store instances writing the same data file 48 times, then forty overlapping writes on one instance. All writes must leave valid JSON and zero temporary files.

## Red-green executed evidence
- **Original source:** the two new concurrency tests failed 2/2 with the exact `ENOENT db.json.tmp -> db.json` that appeared in Vercel.
- **Patched source:** the same two tests passed 2/2, leaving no temp files.
- Real Claude Code MCP HTTP/stdio relay e2e test passed; all 9 MCP tests pass.
- Broader JSON store, parity, queue and cloud relay suite: 53 tests total, 48 PASS, 5 documented optional skips, 0 failures.
- Before any release merge, require complete exact-head GitHub Actions and both exact-head Vercel previews READY. Never infer hosted release success solely from this local red-green test.

No new spending, secret exfiltration, outreach, owner credential entry, production mutation, or changes to other concurrent worktrees. Preserves all original PHOENIX and UberBond lineage.
