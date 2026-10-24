# PHOENIX / UberMind Ω47 Machiavelli integration checkpoint

**Date:** 2026-10-24. **State:** SOURCE_AND_READER_IMPLEMENTED_ON_DRAFT_PR; NOT merged. **PR:** #1564. **Owner GitHub main at branching:** `0af0dcd31631e6f28dc0014b7c7475ef9d163085`.

## Done and verified

- Four source editions indexed with original provenance and scope: Prince 26 chapter slots, Discourses 142 chapter slots, Art of War 7 books, Florentine Histories 8 books. Total 183 source address slots; 106 curated original historical paraphrases and business interpretation pairs.
- No full original text in repository; no claim all surviving works fully read. The strategic sourcebook explicitly separates primary chapter headings from interpretation, contested scholarly perspectives and modern business analogies.
- Deterministic offline read-only retrieval API, CLI, 8 hostile/positive tests. **Local Node v22: 8 passed, 0 failed.**
- SHA-256 uncompressed corpus: `56e4a5eb45189e2b238dbf6c758a50280366214c0a324b8656173b2400f12c1b`. Source contents transferred through an exported exact-source bundle. **All six new GitHub files fetched back byte-for-byte equal** to the locally tested bundle.
- Existing Ω46 social-strategy skill and `AI_START_HERE.md` updated on branch; all 890 founder ideas and the Sovereign Cognitive Continuum remain preserved. Nothing deployed or charged.
- Independent Library archive: `/UberBond/PHOENIX/Machiavelli/UberMind_Omega47_Source_And_Executable_Bundle.md` and original strategy sourcebook.
- Business/outreach/provider-effect authority **NONE**. No buyer contacted, model inference billed, deployment, money moved or new permissions.

## Blocking authority / integration

The connected Codespace tool fails with `Tunnel-client has not been seen for 300 seconds`; direct PHOENIX tool fails with `Session terminated`. Thus *repository-wide* canon, syntax and readiness tests could not be run against branch exact head. The source additions under `src/` and `scripts/` require canonical readiness regeneration before merge. Two GitHub Vercel checks presently fail at account deployment layer and are not evidence of a source test failure. **PR #1564 must remain DRAFT and unmerged** until required local/global gates pass; do not overwrite generated canon by hand.

## Resume plan

1. Restore authenticated Codespace connectivity, refresh `main`, inspect PR #1564 for drift/duplicates and create clean isolated worktree.
2. Run `node --test tests/machiavelli-strategic-canon.test.mjs`, `npm run check:syntax`, `npm run readiness`, `node --test tests/canon-freshness.test.mjs tests/reachability-ratchet.test.mjs`, then any relevant social-strategy/revenue regression tests. Preserve exact stdout/exit statuses; regenerate source-bound readiness with canonical script.
3. Create reviewed follow-up commit on branch with readiness updates; verify Github exact head/CI; merge only under valid authority and gates; verify final `main` in fresh checkout. Treat Vercel account block separately.
4. For future source expansion, ingest verified translations chapter-by-chapter and index secondary surviving writings; record license and hashes rather than asserting unknown material is loaded.

**Next economic evidence:** none. This is a knowledge/retrieval upgrade, not verified EQ, improved negotiations or cleared profit.
