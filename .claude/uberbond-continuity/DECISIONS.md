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

## 2026-07-21 — Scoping decision: P1-09/P0-08/P1-11 deferred

After completing all directly-actionable P0 findings (P0-01, P0-03/04/05/13, P0-06, P0-07) plus
P1-10 and P1-12, the remaining P1-09 (token CAS) and the fuller part of P1-11 (encrypted work
items) both require building a new `inboundAccounts` protected-collection repository that does
not exist anywhere in the codebase yet -- this is real, separate infrastructure (owner-approval
flow, encrypted token CAS, keyed-hash dedupe, retention TTL), not a contained bug fix like the
findings already closed. Rather than rushing a half-built version of it to claim more matrix rows
green, it was left honestly Not Run/Not attempted, documented in IMPLEMENTATION_REPORT.md and the
hostile matrix, with the exact next steps recorded in NEXT_SESSION_PROMPT.md / SESSION_STATE.md
for a future session.

## 2026-07-21 — P0-05 terminal-timeout policy: intentional reversal, not a judgment call left open

The rejected branch's own test asserted "a cycle-timeout must not finalize the run -- it stays
retryable," directly opposite to the definitive repair spec's explicit P0-05 requirement (terminal
finalize, cleared lease, new run ID required to continue; resumption would need "a separate
per-attempt deadline model... independently reviewed"). Implemented the spec's terminal policy as
directed, since resolving exactly this kind of P0 finding was the stated purpose of the repair
pass, and rewrote the test to verify the new (correct) behavior. Documented in the relevant commit
message and TEST_LOG.md rather than silently changed.
