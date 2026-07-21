# DECISIONS LOG

## 2026-07-21 — Scope pacing decision

The mission text ("UBERBOND MAX-SCORE OVERNIGHT COMMAND") asks for five phases in one
continuous pass, including full re-implementation of lease/fencing/cancellation/OAuth-CAS/
MIME-bounding/payment-signal-reading for the autonomy orchestrator, a full hostile test
matrix run (including real isolated-PostgreSQL race proof), a packaged review ZIP, and
then a *second*, separately-scoped revenue-pilot tool (Apify import/dedupe/prospect board)
with its own hostile test suite and its own ZIP.

Decision: treat this as a real, multi-group engineering effort executed incrementally with
real verification at each step, not a single blind pass. Every "Pass" claim will be backed
by an actually-executed command and captured output in TEST_LOG.md. Rows requiring
environment not yet confirmed available locally (real isolated Postgres server, GitHub CI,
browser test runner) are marked BLOCKED — NOT VERIFIED until directly confirmed, per the
explicit instruction not to fabricate CI/Postgres-race/browser evidence.

Repair work proceeds in the exact group order from
`UBERBOND_PR4_CLAUDE_CODE_HANDOFF.md` Phase 2, item 5 (ancestry → protected collections →
lease/fencing → cancellation/timeout → inbound-only Gmail runtime → bounded HTTP/MIME →
token CAS → privacy work-items → follow-up stop → payment signals → hostile test
completion/evidence).

The separate revenue-pilot worktree (Phase 5) is explicitly gated on the P2.2 package being
frozen first, per the mission's own ordering, and will not be started before that.

## Stop conditions actively being watched (from PATCH_GUIDE.md Phase A)

- lite/ diff must stay zero at every commit — checked before/after each group.
- No conflict resolution may touch lite/ — will abort any such conflict rather than resolve it.
- No test may be weakened/skipped/relabeled to go green.
- No claim of CI-green or real-Postgres-race-pass without an actual run.
