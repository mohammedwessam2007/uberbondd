# UberBond Night Swarm Coordination Protocol

Status: ACTIVE for issue #463 and PR #458.

Purpose: connect ChatGPT/Sol, Claude Code, UberBond's own self-maintainer/self-deployment runtime, and optional GPT Work through durable shared repository state instead of relying on one chat/session.

## Shared nervous system

All agents MUST refresh these before claiming new work:

1. PR #458 exact head.
2. Issue #463 comments.
3. `artifacts/night/swarm-control-plane.json`.
4. Existing claim/receipt files under `artifacts/night/swarm/`.
5. Current implementation coverage/readiness/handoff when relevant.

Issue #463 is append-only coordination traffic. Do not rewrite another agent's receipt.

## Message format

Each checkpoint comment on #463 must begin with one of:

`[SWARM:CLAIM]`
`[SWARM:CHECKPOINT]`
`[SWARM:BLOCKER]`
`[SWARM:RELEASE]`
`[SWARM:MERGED]`
`[SWARM:STRATEGY_MUTATION]`

Then include:

- `agent`: SOL | CLAUDE | UBERBOND | WORK
- `packet`: exact packet ID
- `base`: exact #458 SHA the work started from
- `branch`: child branch or `NONE`
- `write_surfaces`: exact files/directories intended
- `head`: current exact commit or `NONE`
- `tests_executed`: exact commands/counts, never inferred
- `result`: PASS | FAIL | PARTIAL | BLOCKED | CLAIMED
- `blocker_class`: SOURCE | INFRASTRUCTURE_NON_EVIDENCE | OWNER | EXTERNAL | ELAPSED_TIME | NONE
- `next`: exact next dependency

## Claim law

Before editing, an agent posts `[SWARM:CLAIM]` to #463 and, when practical, creates:

`artifacts/night/swarm/claims/<packet-id>.<agent>.json`

A claim includes exact write surfaces. If another active claim overlaps the same source module, the later agent MUST choose a different packet or coordinate through a parent integrator.

Do not claim the same broad directory when only one file is needed.

## Receipt law

A completed packet creates:

`artifacts/night/swarm/receipts/<packet-id>.<agent>.json`

Receipt fields:

- packetId
- agent
- baseSha
- headSha
- sourceDelta
- actualTests
- mutationEvidence if applicable
- reachability
- authorityBoundary
- privacyBoundary
- blockerClassification
- integrationTarget
- progressDeltaReason

The existence of a receipt is NOT proof of PASS. The receipt must state actual executed evidence.

## PR law

Create a child PR only when:

- the packet has independent merge value;
- write surfaces are disjoint enough for parallel work;
- source/test evidence is durable;
- the PR can be reviewed without importing unrelated speculative changes.

Otherwise batch sibling packets into one parent-organ PR.

Do not optimize PR count. Optimize parallel verified throughput.

## Integration law

PR #458 is the only night integration spine.

SOL owns the merge tribunal unless issue #463 explicitly changes this.

Claude/Work/UberBond do not merge their own large child work into #458 merely because tests pass. They post receipts and mark the child review-ready. SOL or an explicitly delegated integration agent reconciles current #458, checks overlaps, and merges with expected-head protection.

## Self-deployment participation

UberBond's own self-maintainer/self-deployment mechanisms may participate only within their existing authority boundaries.

They may:

- inspect provider/substrate state;
- generate deployment/continuation receipts;
- choose lawful alternate provider/substrate strategies;
- run synthetic doctors/rehearsals;
- compile capability requirements;
- propose patches through governed review paths.

They may NOT infer authority to purchase, create paid commitments, bypass quotas/access controls, expose secrets, send customer messages, or merge/deploy production changes without existing authorization.

If the current deployment substrate is blocked:

`same blocker + same strategy + no new safe evidence => STRATEGY_MUTATION_REQUIRED`

Allowed mutation families include alternate authorized provider, portable self-hosted runtime, deterministic/local execution, capability substitution, decomposition, or explicit external-blocked classification.

## No-loop law

Clock time is not new evidence.

A packet blocked by the same causal condition cannot be reclaimed with the same strategy merely because time passed.

A principled `STOP` remains valid when no safe worthwhile internal action exists.

## Morning convergence

Before morning integration:

- release stale claims;
- close/supersede dead child PRs;
- merge verified independent children into #458;
- regenerate exact-head coverage/readiness/reachability/handoff;
- classify every remaining blocker;
- merge #458 to main only if exact evidence earns it.

Terminal law: Mohamed provides will. UberBond provides intelligence. Reality provides feedback.
