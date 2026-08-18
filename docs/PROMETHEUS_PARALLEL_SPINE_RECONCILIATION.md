# Prometheus Parallel Spine Reconciliation

## What happened

While this session was building the vertical economic spine this wave's
mission asked for, `git push` was rejected: the remote branch had
diverged. A concurrent session — almost certainly another Claude Code
instance working the same mission prompt at the same time — had pushed 18
commits building an independently-named, conceptually near-identical
vertical economic spine to the same branch. Both bodies of work are real:
both pass their own tests, both were built honestly against the same
mission text, and neither knew the other existed until this merge.

This is the exact "parallel truth system" failure mode the mission's own
Critical Architectural Law warns against — except this time it happened
live, between two agent sessions, not across historical branches. It is
disclosed here in full rather than silently resolved by picking a side,
exactly as `docs/PROMETHEUS_BRANCH_RECONCILIATION.md` handled the
OMNIA-V9-vs-Guard discovery earlier in this session.

## Resolution taken this wave: merge, don't discard, don't force

`git push --force` would have destroyed the concurrent session's real
work. Silently keeping only one side's modules would have discarded real,
tested code. Instead: a real `git merge` was performed. Every file unique
to either side is present. The five files both sessions touched
(`package.json`, `src/job-handlers.mjs`, `src/capability-graph.mjs`,
`tests/capability-graph.test.mjs`, three docs) were hand-merged to
preserve both sides' content — `src/job-handlers.mjs` now registers job
types from both sessions with zero name collisions (one pair of
same-named exports, `compileUpgradeProposal`/`compileEngineeringMissionPacket`,
was resolved with an import alias, not a deletion).

**What this wave's merge does NOT do**: deduplicate the underlying
concepts. That is real, substantial follow-up engineering work — comparing
two independently-designed implementations of the same idea, deciding
which (if either) becomes canonical, and migrating callers — not something
to rush in the same turn that just discovered the problem.

## The overlapping pairs (same concept, different implementation)

| Concept | This session | Concurrent session |
|---|---|---|
| Signal ingestion | `src/signal-ingestion.mjs` + `src/genome-extraction.mjs` (over `src/market-signal.mjs`) | `src/market-signal-registry.mjs` |
| Experiment compiler | `src/experiment-compiler.mjs` | `src/commercial-experiment.mjs` |
| Distribution channel/allocator | `src/distribution-channel-registry.mjs` + `src/distribution-allocator.mjs` | `src/distribution-channel.mjs` |
| Commercial outcome lineage | `src/commercial-outcome-graph.mjs` | `src/commercial-outcome.mjs` |
| Revenue-weighted learning / memory | `src/revenue-weighted-learning.mjs` + `src/commercial-memory.mjs` | `src/commercial-learning.mjs` |
| Upgrade proposal / engineering packet | `src/upgrade-proposal.mjs` + `src/engineering-mission-packet.mjs` | `src/self-upgrade.mjs` |
| Vertical orchestrator | `src/commercial-spine.mjs` | `src/prometheus-economic-spine.mjs` |

Neither list was read line-by-line against the other this wave — that
comparison (behavioral differences, which has better test coverage on
which edge cases, which composes more cleanly with the rest of the
codebase) is the actual reconciliation work, deliberately not rushed here.

## What does NOT overlap — genuinely additive from the concurrent session

`src/task-universe.mjs`, `src/prometheus-control-tower.mjs`,
`src/agent-relay.mjs`, `src/mechanism-lab.mjs`,
`src/business-model-fitness.mjs`, `src/adapter-contracts.mjs`,
`src/capital-allocator.mjs` — no equivalent exists in this session's work.
These extend the completion matrix (see
`docs/PROMETHEUS_FINAL_IMPLEMENTATION_REPORT.md`) beyond what this session
alone built, and are additive value from the merge, not duplication.

Also genuinely additive from this session only: `src/consequence-boundary.mjs`
+ vendored `src/omnia-v9/`, `src/shadow-canary-contract.mjs`, the PR
housekeeping (`docs/PROMETHEUS_PR_HOUSEKEEPING.md`), and the two new
scheduled recomputation jobs.

## Recommendation for the actual reconciliation (not executed this wave)

1. For each of the 7 pairs, read both implementations side by side and
   assess: test coverage depth, which handles more edge cases, which
   composes more cleanly with `src/opportunity-registry.mjs` and
   `src/offer-compiler.mjs` (the shared foundations both sides built on).
2. Default bias: prefer whichever implementation has the stronger
   adversarial/hostile test coverage for its specific concept, not whoever
   "got there first."
3. Once a winner is chosen per pair, migrate `src/job-handlers.mjs` (and
   any other caller) to the winner, then delete the loser's module and
   tests — a real, reviewable deletion, not a silent drop.
4. This is bounded, mechanical work once someone (human or a future
   session) actually does the side-by-side read — it does not require new
   design, since both sides already solved the same problem.

## Why this wasn't done automatically this wave

Comparing ~13 files (7 pairs × ~2 files each, some pairs are 1-vs-2 files)
in depth, then safely migrating every caller and deleting the losing side,
is real engineering judgment work — not a mechanical merge. Rushing it
under time pressure, in the same turn that just discovered the
duplication, risks deleting the wrong side or introducing a regression
neither session's own tests would catch (since each side only tested
itself). Disclosing it clearly and leaving both sides working and tested
is safer than a rushed, unreviewed deletion.
