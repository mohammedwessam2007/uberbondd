# Prometheus Self-Upgrade Engine

## Status: deferred, with a specific reason distinct from the distribution brain's

Unlike the Distribution Brain (deferred purely for lack of input data), the
Self-Upgrade Proposal Engine (Wave 26) and Engineering Mission Packet
Compiler (Wave 29) are deferred because **this session already found a
concrete, real upgrade backlog that a hypothetical proposal-generation
engine would just be re-deriving**:

- `docs/PROMETHEUS_CANONICAL_INTEGRATION_PLAN.md` — the actual highest-
  value pending upgrade decision in this repository right now (V9-canonical
  vs. Guard-canonical), already written as a concrete two-branch action
  plan with owner-decision points, cherry-pick candidates, and sequencing.
- `docs/OVERNIGHT_HANDOFF.md` / prior waves' "Remaining risks" and "Next
  highest-leverage wave" sections — a running, real log of exactly the
  `UpgradeProposal` shape the mission asks for (proposed capability,
  economic rationale, evidence, build distance, kill criteria), just not
  wrapped in a class named `UpgradeProposal`.

Building a generic proposal-generation *engine* whose first and only real
output would be "here's the V9 decision, formatted as JSON" is
over-engineering relative to just writing that decision plan directly,
which is what happened. The `BUILD/BUY/PARTNER/ADAPT` router (Wave 27) has
the same issue: its one real input this session
(`docs/PROMETHEUS_BRANCH_RECONCILIATION.md`'s cherry-pick recommendations)
was already produced by direct analysis, not by running data through a
router abstraction.

## When this would become real engineering, not decoration

Once there are 3+ independent real upgrade candidates competing for
priority at once (not the current single V9-decision bottleneck), a real
`UpgradeProposal` schema + `BUILD/BUY/PARTNER/ADAPT/DEFER/REJECT` router
earns its complexity — until then, the direct-analysis docs already
produced this wave do the same job with less code to maintain.

## Shadow/Canary (Waves 31–32): same reasoning

There is currently exactly one candidate comparison in this repository that
shadow-evaluation would apply to (V9's admission kernel vs. this branch's
Deliverability Guard) — and the reconciliation doc already recommends
*not* running them side-by-side in production shadow mode until the owner
picks one, specifically because both are real enough that a shadow
comparison would need real traffic to be meaningful, and outbound traffic
stays structurally disabled. A generic `ShadowComparison` primitive with
one disabled use case is not worth building yet.
