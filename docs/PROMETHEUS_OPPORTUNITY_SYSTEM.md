> **V2 update**: the "deferred" items below (experiment compiler, mostly)
> are now real — `src/experiment-compiler.mjs`, 12 tests, composes with
> the real offer compiler. Mechanism atoms and the recombination engine
> remain deferred for the same reason as before (no real evidence base).
> See `docs/PROMETHEUS_FINAL_IMPLEMENTATION_REPORT.md` for the current
> per-subsystem status.

# Prometheus Opportunity System

## What's real (Wave 6 + this wave)

- **`src/opportunity-registry.mjs`** — `compileBusinessGenome()`,
  `scoreOpportunity()`, `rankOpportunities()`, `nextPromotionStage()`,
  `incrementalBuildDistance()`. 32 tests. Scores caller-supplied candidates
  against the mission's 15 Money Model Tournament criteria; a criterion with
  no supplied evidence contributes zero to the weighted score rather than a
  fabricated neutral guess, and confidence is computed separately from
  score so a theoretically attractive but weakly-evidenced opportunity
  cannot look safe. The promotion ladder
  (`DISCOVERED → EVIDENCED → SCORED → PROPOSED → BUILT → VERIFIED → SHADOW
  → CANARY → ECONOMICALLY_PROVEN → PROMOTED`) cannot skip a stage.
- **`src/capability-graph.mjs`** (this wave) — feeds real
  `existingCapabilityIds()` into `incrementalBuildDistance()` instead of a
  caller-typed list, and honestly represents the two stranded lineages
  (OMNIA V9, Canon/V3) as `MISSING` on this branch even though they're real
  elsewhere — see `docs/PROMETHEUS_BRANCH_RECONCILIATION.md`.

## What's deferred, and why

- **Mechanism Atom Library (Wave 11)** and **Economic Recombination Engine
  (Wave 12)** — generating and recombining "reusable business mechanisms"
  has no real evidence base to draw atoms from yet (this session performed
  no live market research this wave; see `docs/PROMETHEUS_SCOPED_VERDICT.md`
  for why). Building a recombination engine over zero real atoms would
  produce combinatorial noise, not intelligence — a `BUILD NOTHING` call
  per the mission's own third invariant.
- **Business Genome extraction from live `MarketSignal`s (Wave 10)** — the
  genome compiler already exists and already accepts arbitrary evidence-
  tagged candidates; what's missing is signals to extract genomes *from*,
  which depends on the deferred adapter/ingestion layer
  (`docs/PROMETHEUS_SOURCE_ADAPTERS.md`).
- **Opportunity Tournament V2 (Wave 15)** — the mission asks for additional
  criteria (current capability reuse, incremental build distance, time to
  proof) beyond the 15 already implemented. Capability reuse and build
  distance are *already wired* this wave via `capability-graph.mjs`; adding
  the remaining criteria without any real opportunity candidates to score
  them against would be untestable in any way beyond "does the arithmetic
  run," which the existing 32 tests already establish the pattern for. Left
  for the wave that actually has real candidates.

## Demonstration (real code, illustrative candidates)

`docs/PROMETHEUS_SCOPED_VERDICT.md` (prior wave) already ran the scorer
against three honestly-tagged illustrative candidates and showed the
anti-fabrication property directly: two `HYPOTHESIS`-only candidates
produced real composite scores but **zero confidence**. That demonstration
still holds; it is not repeated here.
