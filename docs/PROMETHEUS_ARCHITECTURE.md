# Prometheus Architecture (as actually built, this branch)

## What's real vs. what's designed-but-deferred

```
WORLD
  |
  v
[MarketSignal]              REAL, TESTED   src/market-signal.mjs (20 tests)
  |                         Pure normalizer. No adapters feed it yet -- deliberate,
  |                         see "Why adapters are deferred" below.
  v
[Source Adapters]           DEFERRED       docs/PROMETHEUS_SOURCE_ADAPTERS.md
  |
  v
[Signal Ingestion/Dedup]    REAL, TESTED   src/market-signal-registry.mjs
                              Bounded caller-supplied ingestion over auditLog; no source adapter/network
                              is implied and empty adapter input produces zero signals.
  |
  v
[Business Genome /          REAL, TESTED   src/opportunity-registry.mjs (Wave 6, 32 tests)
 Opportunity Scoring]       Scores caller-supplied candidates against 15 Money Model
  |                         Tournament criteria and is composed with MarketSignal by
  |                         src/prometheus-economic-spine.mjs.
  v
[Capability Graph /         REAL, TESTED   src/capability-graph.mjs (this wave, 11 tests)
 Build Distance]            Honest static registry + incrementalBuildDistance().
  |
  v
[Commercial Experiment      REAL, TESTED   src/commercial-experiment.mjs
 Compiler]                                 Preparation-only PROBE contract. No live
  |                                        experiment or external authority.
  v
[Distribution Channel       REAL, TESTED   src/distribution-channel.mjs
 Registry / Allocator]                     Fail-closed: no verified cleared-payment
  |                                        outcomes -> DO_NOT_DISTRIBUTE; never sends/spends.
  |
  v
[V9-governed consequence]   PARTIAL, TWO SYSTEMS EXIST, NEITHER CHOSEN
  |                         This branch: Deliverability Guard (small, tested, live-dry-run).
  |                         Unmerged PR #24: OMNIA V9 formal kernel (large, tested, real).
  |                         See docs/PROMETHEUS_BRANCH_RECONCILIATION.md -- an owner
  |                         decision, not an engineering gap.
  v
[Payment / Delivery /       REAL, TESTED   src/payments.mjs, src/revenue.mjs,
 Retention]                                src/offer-compiler.mjs, src/founder-command-center.mjs
  |                         Zero real transactions have occurred.
  v
[Commercial Outcome         REAL, TESTED   src/commercial-outcome.mjs
 Lineage]                                  Uses existing payment truth + auditLog; no parallel
  |                                        revenue ledger. Zero cleared payments currently exist.
  v
[Commercial Memory]         REAL, TESTED   src/commercial-learning.mjs
  |                                        Bounded summaries over existing
  |                                        commercial_outcome audit receipts;
  |                                        contradictions, missing economics,
  |                                        and refund uncertainty stay explicit.
  v
[Task Universe]              REAL, TESTED   src/task-universe.mjs
  |                                        Blueprint/trigger/policy/dependency/
  |                                        evaluator/receipt primitives; bounded
  |                                        local preparation only.
  v
[Self-upgrade proposal]     REAL, TESTED   src/self-upgrade.mjs
                              Review-required UpgradeProposal, bounded
                              EngineeringMissionPacket, and shadow-only gate.
  |
[Control tower / morning]    REAL, TESTED   src/prometheus-control-tower.mjs
                              Composes command-center, learning, audit, and
                              capability facts; unknowns stay UNKNOWN.
  |
[Agent relay / disputes]     REAL, TESTED   src/agent-relay.mjs
                              Evidence-linked worker tasks, budgets, and a
                              three-round dispute ceiling; execution NOT_RUN.
  |
[Mechanism lab]              REAL, TESTED   src/mechanism-lab.mjs
                              Structured genome atoms and bounded unproven
                              recombinations; no scrape/copy/price claims.
  |
[Fitness / death review]     REAL, TESTED   src/business-model-fitness.mjs
                              Payment-proof fitness review; no automatic kill
                              or capital allocation.
  |
[Adapter contracts]          REAL, TESTED   src/adapter-contracts.mjs
                              Terms/purpose/capability manifests and bounded
                              dry-runs; no authentication or network access.
  |
[Capital plan]               REAL, TESTED   src/capital-allocator.mjs
                              Payment-proof ranking and owner-review plan;
                              actual spend remains zero.
  |
  v
WORLD
```

## Why source adapters remain deferred while local ingestion is real

The mission's own philosophy ("BUILD THE SOCKET, NOT FAKE THE ELECTRICITY")
argues for building adapter *contracts* even without credentials. That
principle is followed for `MarketSignal` and the local ingestion registry (real,
tested, credential-independent primitives). It is deliberately **not** extended
to live source adapters or automatic genome extraction this wave, for a reason
specific to what this session's branch reconciliation found, not a generic
reluctance:

The branch reconciliation (`docs/PROMETHEUS_BRANCH_RECONCILIATION.md`)
discovered two large, real, independently-tested unmerged systems — the
OMNIA V9 kernel and the Canon/V3 acquisition cycle — that already contain
opinions about evidence, authorization, and opportunity shape. Building a
third, independent live adapter pipeline this wave, before the owner decides
whether V9 becomes canonical, risks producing exactly the "parallel truth
system" the mission's own Critical Architectural Law forbids. The registry
therefore accepts only caller-supplied candidates, writes compact audit
receipts, and stays empty when adapters are unconfigured. `MarketSignal` and
the registry remain free of credentials and provider assumptions; a future
adapter still needs a documented lawful access path and must not be inferred
from this local contract.

## What actually composes with what, today

`market-signal-registry.mjs`, `prometheus-economic-spine.mjs`,
`commercial-experiment.mjs`, `distribution-channel.mjs`,
`commercial-outcome.mjs`, `commercial-learning.mjs`, `task-universe.mjs`,
`self-upgrade.mjs`, and `prometheus-control-tower.mjs` now form a
preparation-only vertical composition. Task generation, upgrade packets, and
control-tower receipts do not enqueue, execute, promote, or authorize external
actions.
The modules remain honest about their inputs: source adapters, buyer outcomes,
and payment proof are still external dependencies. `opportunity-registry.mjs`
and `capability-graph.mjs` also compose through the graph's real
`existingCapabilityIds()` rather than a hand-typed list.
