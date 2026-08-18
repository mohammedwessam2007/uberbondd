> **V2 update**: the diagram below (from V1) undersold what's real as of
> the current wave. Signal Ingestion, Business Genome extraction,
> Commercial Experiment, Distribution Channel Registry/Allocator,
> Commercial Outcome Graph, Revenue-Weighted Learning, Commercial Memory,
> Upgrade Proposal, and Engineering Mission Packet are now all
> `IMPLEMENTED_VERIFIED` and composed end-to-end by `src/commercial-spine.mjs`
> — see `docs/PROMETHEUS_FINAL_IMPLEMENTATION_REPORT.md`'s completion
> matrix for the authoritative current status of every row below. V9-Guard
> composition is also now real: `src/consequence-boundary.mjs`, wired into
> `Pipeline.maybeSend`. Only the adapter/market-radar layer (far left of
> the diagram) remains genuinely blocked, on real credentials, not
> engineering effort.

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
[Signal Ingestion/Dedup]    DEFERRED       (would consume MarketSignal + adapters)
  |
  v
[Business Genome /          REAL, TESTED   src/opportunity-registry.mjs (Wave 6, 32 tests)
 Opportunity Scoring]       Scores caller-supplied candidates against 15 Money Model
  |                         Tournament criteria. Not yet wired to MarketSignal --
  |                         that wiring is exactly the deferred ingestion layer above.
  v
[Capability Graph /         REAL, TESTED   src/capability-graph.mjs (this wave, 11 tests)
 Build Distance]            Honest static registry + incrementalBuildDistance().
  |
  v
[Commercial Experiment      DEFERRED       No experiments exist to compile yet --
 Compiler]                                 building this now would be scaffolding
  |                                        with nothing real to hold.
  v
[Distribution Channel       DEFERRED       docs/PROMETHEUS_DISTRIBUTION_BRAIN.md
 Registry / Allocator]
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
[Commercial Memory]         PARTIAL        Raw data exists (store.log()/auditLog);
  |                                        no summarizing/query layer beyond the
  |                                        founder command center's narrow slices.
  v
[Self-upgrade proposal]     DEFERRED       docs/PROMETHEUS_SELF_UPGRADE_ENGINE.md
  |
  v
WORLD
```

## Why adapters/ingestion/genome-extraction are deferred, not stubbed

The mission's own philosophy ("BUILD THE SOCKET, NOT FAKE THE ELECTRICITY")
argues for building adapter *contracts* even without credentials. That
principle is followed for `MarketSignal` itself (a real, tested, credential-
independent primitive). It is deliberately **not** extended to the adapter/
ingestion/genome-extraction layers this wave, for a reason specific to what
this session's branch reconciliation found, not a generic reluctance:

The branch reconciliation (`docs/PROMETHEUS_BRANCH_RECONCILIATION.md`)
discovered two large, real, independently-tested unmerged systems — the
OMNIA V9 kernel and the Canon/V3 acquisition cycle — that already contain
opinions about evidence, authorization, and opportunity shape. Building a
third, independent ingestion pipeline this wave, before the owner decides
whether V9 becomes canonical, risks producing exactly the "parallel truth
system" the mission's own Critical Architectural Law forbids. `MarketSignal`
was kept deliberately free of any assumption about which system consumes
it (see its own file header) specifically so it survives either outcome.
Adapters and ingestion, by contrast, would need to make real choices about
where signals land — that's premature until the reconciliation's pending
decision is made.

## What actually composes with what, today

`opportunity-registry.mjs` (scoring) and `capability-graph.mjs`
(build-distance input) already compose — proven by
`tests/capability-graph.test.mjs`'s `incrementalBuildDistance()` tests,
which drive the scorer's build-distance calculation from the graph's real
`existingCapabilityIds()` rather than a hand-typed list. `market-signal.mjs`
does not yet compose with `opportunity-registry.mjs` — that link is the
deferred ingestion layer, and deliberately so per the above.
