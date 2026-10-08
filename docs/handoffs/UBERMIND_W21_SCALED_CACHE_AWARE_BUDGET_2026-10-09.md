# UberMind W21 — Actual Cache-Aware Scaled JEV Execution

Date: 2026-10-09 Cairo. Parent verified main `906f91f384c19b5671e95b446084aed621e222ed`, W20/W20 test corrected, Render deployed W20+diagram `dep-db42c5k9v7es738s1fk0` LIVE, native Node v26.11.1 `237/237`. Original 890 shards unchanged.

## Concrete fresh bottleneck
W19 direct `executeGovernedJevTensor` already consults `src/jev-public-answer-reuse.mjs` before paying, and permits 31 previously billed PUBLIC groups + 1 fresh group on one-group budget. But W11 **scaled** executor `executeScaledJevUnderBudget` still always used `groupCount × groupCeiling` to reject a whole 35-group multi-shard batch before checking any verified reusable public result. That defeated the W19 optimization precisely where we needed a large workload.

## W21 repair
In `src/jev-scaled-preflight.mjs`, let the scaled runner optionally call a trusted read-only `lookupValidatedPublicAnswer` on **every actual compiled group across all shards before any dispatch**. Use the same W16/17/19 protected cache adapter bound to current provider route and explicit owner authorization, not client-supplied cache-hit counts. Confirm the exact source/tenant/credential/quality/freshness/input/route-bound type and zero-effect cached result; unknown/poisoned cache -> refuse whole plan at zero provider calls. Only true **fresh groups** contribute to initial global paid reservation.

The actual shard runner still rechecks cache+paid claims and limits every actual inference via W19. Cross-shard global budget is decremented only by observed, reconciled per-shard microusd, and each next shard can receive no more than the unspent global ceiling. Cached preflight hits can expire between the read and execution; any new miss must independently fit the *remaining* global budget or fails without paid dispatch. Unknown provider response after crossing remains held, no automatic retry and no partial advisory answers released.

The actual service `src/jev-governed-runtime-service.mjs` now passes **its existing protected** `publicReuse.read` into W11 scaled runner. It never fetches or pays on startup; real paid path still requires existing explicit authorization/current fixed price, provider key, metered runtime ledger, hard per-group and monthly limits.

## Executable hostile experiments (synthetic/mocked, not live charges)
- 35 distinct PUBLIC scoped groups with 33 previously billed valid source-bound cached answers and 2 misses, split into multiple shards: restores 35 answers under 2×100-microusd global admission, 2 mock provider calls.
- 40 distinct groups all cached: successful 0 new mock provider calls across shards.
- Poisoned or unknown protected answer read refuses entire batch before any external calls.
- A cache result that expires after initial preflight and after first actual charge cannot create an unbounded second provider spend; no retry or partial fanout.

The tests do **not** verify real 35 distinct frontier-quality task equivalence, nor claim 33,333× measured money. Real baseline/provider bills/quality remain unknown and standing permission to spend is unchanged.

## Upstream source deficit observed
At main `906f91f384c19b5671e95b446084aed621e222ed`, real Render log `UBERMIND_LIVE_WORK_INTAKE` reports `LIVE_GITHUB_SOURCE_READ_INCOMPLETE`, 12 selected public issue GETs each `SOURCE_HTTP_UNAVAILABLE:403`, 0 verified sources. W20 shadow precommit cannot create genuine sourced tasks in that run. Do not interpret mocked 12-issue tests as actual live source intake. A supported authenticated and complete public GitHub REST read with official permission and endpoint credentials (or independent source-verified fallback) is the next blocker before real JEV issue work can be executed. Do not stash public source bodies or secrets in public repo, invent provider consent or replay historic unknown Haiku charges.

## Founder donor lineage / north star
Original #0001 Causal Compiler, #0015 Uncertainty Engine, #0057 Proof Economy, #0058 Error Economy, #0059 Prediction Accounting, #0060 Civilizational Memory, #0226 Intelligence Compound-Interest Engine, #0445 Reality Profiler, #0653 Self-Falsifying System, #0877 Recursion Proof System. All other founder ideas #0001–#0890 remain retrievable from immutable manifest/shards, GENESIS keeps successors. Higher personal-life North Stars not narrowed by this economic work.

## PHOENIX
`UBERMIND-W21-20261009-SCALED-ACTUAL-CACHE-AWARE-GLOBAL-BUDGET`. On execution completion write exact PR/merge SHA, Render deploy ID, test receipt and status in issue #1188. Do not assert global quality or cash results. No owner purchase, outreach, account mutation, KYC or paid provider inference requested by this wave.
