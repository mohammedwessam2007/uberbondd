# Prometheus Parallel Spine Reconciliation

## Status: RESOLVED (Wave 0, UberBond Ascension mission)

This document originally disclosed a live duplication: two concurrent
Claude Code sessions independently built overlapping vertical economic
spines on this branch in the same wave (full original account preserved
below, under "What happened"). That merge deliberately did **not**
deduplicate the underlying concepts — it disclosed the duplication and
left both sides working and tested, with a recommended reconciliation
procedure.

This wave executed that procedure. A background research agent read all 7
pairs in full (both implementations, all their tests, every consumer via
repo-wide grep, and the 4 canonical systems each side composes with:
`payments.mjs`, `offer-compiler.mjs`, `consequence-boundary.mjs`,
`capability-graph.mjs`). Its evidence — file:line-cited test-coverage
comparisons, production-wiring analysis via `src/job-handlers.mjs`, and a
per-pair recommendation — is summarized below alongside the decision
actually taken and executed.

## Headline finding: production wiring was already lopsided

`worker.mjs`/`server.mjs` are the only two production entrypoints that
call `createJobHandlers()`. Before this wave, `src/job-handlers.mjs`
already imported exclusively from the "concurrent session" (B) side in 6
of 7 pairs, and from **both** sides in the 7th (learning/memory). This
session's (A) full orchestrator, `src/commercial-spine.mjs`, and 8 of its
supporting modules had **zero production callers** — reachable only from
their own tests. That asymmetry shaped every decision below: B was
already canonical by wiring in most pairs; the real work was verifying
that was the *right* call, not just the *existing* one, and rescuing the
genuinely non-duplicate pieces A had that B did not.

## The 7 decisions

| # | Concept | Decision | Canonical | Deleted |
|---|---|---|---|---|
| 1 | Signal ingestion | **Split** | `src/market-signal-registry.mjs` (B) for ingestion; `src/genome-extraction.mjs` (A) kept as the only bridge to `opportunity-registry.mjs` | `src/signal-ingestion.mjs` |
| 2 | Experiment compiler | **B wins** | `src/commercial-experiment.mjs` | `src/experiment-compiler.mjs` |
| 3 | Distribution channel/allocator | **B wins, A's confidence math ported in** | `src/distribution-channel.mjs` | `src/distribution-channel-registry.mjs`, `src/distribution-allocator.mjs` |
| 4 | Commercial outcome lineage | **B wins** | `src/commercial-outcome.mjs` | `src/commercial-outcome-graph.mjs` |
| 5 | Revenue-weighted learning / memory | **Split, keep both** | `src/commercial-memory.mjs` (A) + `src/commercial-learning.mjs` (B) | `src/revenue-weighted-learning.mjs` |
| 6 | Upgrade proposal / engineering packet | **Merge, B wins the file** | `src/self-upgrade.mjs`, now including A's BUILD/BUY router | `src/upgrade-proposal.mjs`, `src/engineering-mission-packet.mjs` |
| 7 | Vertical orchestrator | **B wins** | `src/prometheus-economic-spine.mjs` (+ `src/commercial-experiment.mjs`/`src/distribution-channel.mjs`/`src/commercial-outcome.mjs`/`src/commercial-learning.mjs`/`src/self-upgrade.mjs` as the per-stage chain) | `src/commercial-spine.mjs` |

Net: **9 files deleted** (`src/signal-ingestion.mjs`,
`src/experiment-compiler.mjs`, `src/distribution-channel-registry.mjs`,
`src/distribution-allocator.mjs`, `src/commercial-outcome-graph.mjs`,
`src/revenue-weighted-learning.mjs`, `src/upgrade-proposal.mjs`,
`src/engineering-mission-packet.mjs`, `src/commercial-spine.mjs`) plus
their 8 corresponding test files (`tests/commercial-spine-e2e.test.mjs`
had no A-only replacement needed; `tests/distribution-brain.test.mjs` was
the A-side Pair-3 test). **2 files kept unmodified in role but extended**
(`src/genome-extraction.mjs`, `src/self-upgrade.mjs`, `src/distribution-channel.mjs`
— see "What was ported" below). **2 files kept as-is, unique, no
equivalent on the other side** (`src/genome-extraction.mjs`,
`src/commercial-memory.mjs` — both now have `capability-graph.mjs`
entries, which they lacked before this wave).

### Why each split/merge, not a clean "B wins everything"

- **Pair 1 (signal ingestion)**: B's `market-signal-registry.mjs` has real
  properties A's `signal-ingestion.mjs` lacked — dry-run-by-default,
  explicit batch caps, and same-observation contradiction detection — so it
  is the stronger *ingestion* primitive and is now canonical for that step.
  But A's `genome-extraction.mjs` is the **only** module in the repo that
  turns an accepted signal into a `scoreOpportunity()`-ready candidate,
  honestly propagating the weakest evidence tier among a candidate's
  signals. B has no equivalent at all. Deleting it would have deleted real,
  tested, non-duplicate capability. It was retargeted (not rewritten) to
  accept either ingestion pipeline's accepted-signal shape — see "What was
  ported."

- **Pair 5 (learning/memory)**: this was never really one pair. B's
  `commercial-learning.mjs` is the stronger *outcome-economics aggregator*
  (receipt-level dedup, contradiction quarantine, contribution-margin
  accounting with an explicit `UNKNOWN_AFTER_REFUND_OR_DISPUTE` state) and
  stays canonical for that. A's `commercial-memory.mjs` is a *hypothesis-level*
  memory and contradiction detector with no B equivalent, already
  production-wired via a 24h cron job (`prometheus.commercial_memory.contradiction_scan`)
  that has no B-side analog. Both stay. Only `src/revenue-weighted-learning.mjs`
  (A) was deleted — its one distinguishing idea, ranking engagement signals
  below payment outcomes, had no production caller and no B equivalent; if
  wanted later, it should be rebuilt as an explicit "engagement funnel"
  metric, not blended into `commercial-learning.mjs`'s payment-truth-only
  totals.

- **Pair 6 (upgrade proposal)**: A's `upgrade-proposal.mjs` owned the only
  real BUILD/BUY/PARTNER/ADAPT/DEFER/REJECT *decision* logic in the repo
  (with real capability-graph-driven build-distance composition and a
  tested BUILD-bias guard). B's `self-upgrade.mjs` owned the only real
  *post-decision governance* (evidence-reference format gating, a mandatory
  forbidden-actions list, and `evaluateUpgradeGate`'s shadow-readiness
  check). Neither could be deleted without losing real capability, so the
  router was folded into `self-upgrade.mjs` rather than picking a side.

### What was ported (not just deleted)

- **`src/genome-extraction.mjs`** (Pair 1): its signal-acceptance check
  used to require `signal.ok === true` (A's `signal-ingestion.mjs` output
  shape only). It now accepts either shape via a small `isAcceptedSignal()`
  helper — `.ok === true` (a raw `market-signal.mjs` record, still used by
  its own tests) **or** `.status === 'ACCEPTED' | 'ACCEPTED_STALE'` (the
  canonical `market-signal-registry.mjs` accepted-batch shape). No caller
  currently wires `market-signal-registry.mjs`'s output directly into
  `extractGenomeCandidate` in a job handler — that composition is real and
  tested, but adding a new production job handler for it was judged out of
  scope for a reconciliation wave (that is new functionality, not
  deduplication) and is listed as a next step below.

- **`src/self-upgrade.mjs`** (Pair 6): `routeUpgradeDecision()` and
  `UPGRADE_DECISIONS` were ported in verbatim from `upgrade-proposal.mjs`.
  `compileUpgradeProposal()` gained three new optional parameters
  (`opportunityScore`, `buildDistanceResult`, `isCommodity`); when a caller
  supplies a real `scoreOpportunity()` result and a real
  `incrementalBuildDistance()` result, it now runs the router and records
  `decision` on the proposal. A router `REJECT` blocks the proposal outright
  (`ok: false`, reason `rejected-insufficient-economic-value`) rather than
  producing a reviewable `REVIEW_REQUIRED` proposal with nothing to justify
  it — every other routed decision (BUY/PARTNER/ADAPT/DEFER/BUILD) still
  requires full owner review exactly like any other proposal; the router
  never itself authorizes anything. Existing callers that don't supply
  these fields see `decision: 'NOT_EVALUATED'` and unchanged behavior.

- **`src/distribution-channel.mjs`** (Pair 3): A's
  `distribution-allocator.mjs` had a genuine tiny-sample-overfitting guard
  (confidence tiers by sample size: 0.05 below 3 samples, up to 0.8 at
  30+) that B's allocator lacked — B ranks a channel the moment it has even
  one verified `CLEARED_PAYMENT` outcome. Rather than change B's tested
  ranking/status gating (which never authorizes a live action regardless —
  every plan stays `authorization: OWNER_REQUIRED`, `externalAction:
  DISABLED` — so a low-sample rank is a "don't overstate certainty to the
  founder" concern, not a safety hole), the sample-size confidence tier was
  added as a new informational `sampleConfidence` field on each plan. It
  changes no existing test's expected `status` or ranking order.

### Hostile test suite

`tests/prometheus-adversarial.test.mjs` (9 attack categories, cross-module
seam tests) targeted A-side modules exclusively before this wave. It has
been rewritten module-for-module onto the surviving canonical chain,
preserving every attack category's intent:

- Evidence laundering, duplicate signals, BUILD bias, auto-promotion,
  unsafe consequence escalation: same assertions, now against
  `market-signal-registry.mjs`, `self-upgrade.mjs`'s `routeUpgradeDecision`,
  `shadow-canary-contract.mjs`, and `commercial-memory.mjs`.
- Fake revenue: rewritten against `commercial-outcome.mjs` (a bare
  `PAYMENT_CLEARED` claim with no real payment-truth decision is rejected)
  and `commercial-learning.mjs` (a handcrafted receipt with no real
  `paymentProof` is never counted as verified revenue) — B's stricter,
  proof-based gate replaces A's boolean-flag-based `isSynthetic` gate here,
  which is a genuine strengthening: there is no flag to lie about.
- Channel overconfidence / tiny-sample overfitting: rewritten against the
  new `sampleConfidence` field on `distribution-channel.mjs`'s plans.

### The one item explicitly not resolved this wave

The concurrent-session-authored recommendation flagged that `commercial-spine.mjs`'s
structural `isSynthetic` force-through into `shadow-canary-contract.mjs`'s
`canaryPromotionGate` should be verified against the B chain before
deleting A's orchestrator. On inspection, B's chain does not need a
port: `commercial-outcome.mjs` never has an `isSynthetic` flag to force in
the first place — `PAYMENT_CLEARED`/`RENEWAL_CLEARED` outcomes require a
real `payments.mjs` classifier decision with matching `PAYMENT_TRUTH_POLICY_VERSION`
and a real `providerEventId`, or they are rejected outright. There is no
caller-supplied boolean for a synthetic run to set to `false` and thereby
launder a claim — the proof requirement is structural, not flag-based. This
is not a weaker substitute for A's invariant; it is a different, stricter
mechanism achieving the same guarantee. `shadow-canary-contract.mjs`
remains in the repo (it was always additive, not part of the 7 pairs) but
now has no production caller — its own promotion-blocking role for the
surviving chain is independently covered by `self-upgrade.mjs`'s
`evaluateUpgradeGate`, which always returns `promotion.status: 'PROMOTION_BLOCKED'`
regardless of test results. This is a deliberate, disclosed consolidation
choice, not an oversight; `shadow-canary-contract.mjs` and its test are
kept as a real, tested, reusable shadow-comparison/promotion-gate
primitive for whichever future system needs one next.

## Recommended next steps (not done this wave — genuinely new work, not reconciliation)

1. Wire `market-signal-registry.mjs` → `genome-extraction.mjs` →
   `opportunity-registry.mjs` into an actual job handler, if a caller
   wants signal ingestion to produce a scored opportunity automatically.
   Both halves are real and tested; only the connecting handler is new.
2. Consider whether `commercial-memory.mjs`'s hypothesis-level records
   should also be summarized in `commercial-learning.mjs`'s scope-based
   groups, or remain deliberately separate (hypothesis identity vs.
   opportunity/experiment/channel lineage are different keys today).

---

## What happened (original disclosure, preserved for record)

While this session was building the vertical economic spine this wave's
mission asked for, `git push` was rejected: the remote branch had
diverged. A concurrent session — almost certainly another Claude Code
instance working the same mission prompt at the same time — had pushed 18
commits building an independently-named, conceptually near-identical
vertical economic spine to the same branch. Both bodies of work were real:
both passed their own tests, both were built honestly against the same
mission text, and neither knew the other existed until that merge.

This was the exact "parallel truth system" failure mode the mission's own
Critical Architectural Law warns against — except it happened live,
between two agent sessions, not across historical branches. It was
disclosed in full rather than silently resolved by picking a side, exactly
as `docs/PROMETHEUS_BRANCH_RECONCILIATION.md` handled the OMNIA-V9-vs-Guard
discovery earlier in this session's history.

### Resolution taken at merge time: merge, don't discard, don't force

`git push --force` would have destroyed the concurrent session's real
work. Silently keeping only one side's modules would have discarded real,
tested code. Instead: a real `git merge` was performed. Every file unique
to either side was kept. The five files both sessions touched
(`package.json`, `src/job-handlers.mjs`, `src/capability-graph.mjs`,
`tests/capability-graph.test.mjs`, three docs) were hand-merged to
preserve both sides' content. That merge deliberately did not deduplicate
the underlying concepts — that is the work this document now records as
done, above.

## What does NOT overlap — genuinely additive from the concurrent session

`src/task-universe.mjs`, `src/prometheus-control-tower.mjs`,
`src/agent-relay.mjs`, `src/mechanism-lab.mjs`,
`src/business-model-fitness.mjs`, `src/adapter-contracts.mjs`,
`src/capital-allocator.mjs` — no equivalent exists in this session's work.
These extend the completion matrix beyond what this session alone built,
and are additive value from the merge, not duplication.

Also genuinely additive from this session only: `src/consequence-boundary.mjs`
+ vendored `src/omnia-v9/`, `src/shadow-canary-contract.mjs`, the PR
housekeeping (`docs/PROMETHEUS_PR_HOUSEKEEPING.md`), and the two scheduled
recomputation jobs.
