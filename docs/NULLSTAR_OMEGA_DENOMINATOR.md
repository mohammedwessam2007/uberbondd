# NULLSTAR OMEGA Denominator — N01 to N24

Regenerate with `npm run omega:denominator`. Machine output:
`artifacts/nullstar-omega/denominator.json`. Where the two disagree, the artifact
is right and this file is stale.

## Why a denominator

A percentage without an explicit denominator is theatre, and a denominator that
can be shortened is worse than none: it reports a better number every time a hard
dimension becomes inconvenient. So this list is **additive only** — a compile
that loses a dimension fails, and the check runs against the prior compile's
dimension ids rather than against a rule someone is meant to remember.

## Why states are computed, not asserted

Every state is derived from file evidence. Nothing in the module can hand a
dimension a state; only the tree can.

| state | what it takes |
|---|---|
| ABSENT | no module, no canon |
| CANON | written down, nothing built |
| PARTIAL | some declared modules exist, or modules without full coverage |
| IMPLEMENTED | every declared module exists, no test exercises it |
| VERIFIED | modules exist **and** tests exercise them |
| OPERATING | a run left a receipt on disk |
| REALITY_CALIBRATED | a prediction was later checked against an observation |

The top two rungs are deliberately unreachable from source alone. That is the
difference between a system that could work and one that has, and it is why
writing more code cannot move a dimension past VERIFIED.

## Reading — 2026-09-15

| state | count |
|---|---|
| OPERATING | 7 |
| VERIFIED | 17 |
| ABSENT / CANON / PARTIAL / IMPLEMENTED | 0 |
| **REALITY_CALIBRATED** | **0** |

Zero dimensions are reality-calibrated. Nothing in this repository has yet made a
prediction that was later checked against an observed outcome — which is the
honest state of §312, and no amount of further building changes it.

At the first compile three dimensions were ABSENT: N03 SEALED_HOLDOUTS, N04
BOTTLENECK_DISCOVERY, N10 IMPROVEMENT_VELOCITY. That was the §303 minimum cut
set, and it was exactly the recursive spine. All three are now OPERATING because
runs produced receipts, not because modules were added.

## The G0 → G1 cycle, including its null result

`npm run omega:cycle` runs the spine end to end.

**G0** measured 4 of 17 capability dimensions from local repository evidence and
scored 1.0 on all four. The bottleneck engine correctly flagged that: a saturated
instrument cannot register improvement or regression, and all 17 dimensions
depend on evaluation, giving it the highest leverage in the graph.

Its hypothesis was that the tasks were too easy — each a direct read of a value
an artifact already states. The discriminating test was to add tasks whose
answers must be *derived* across artifacts.

**G1** ran that test. Measured dimensions rose from 4 to 9, every answer derived
rather than read, and **every score was still 1.0**.

The hypothesis is **refuted**, recorded in
`artifacts/nullstar-omega/refutations.json`, and the bottleneck engine will not
re-select it. That is the null-result law working: a generation that disproves
its own diagnosis is a real generation, and re-running a falsified candidate
would spend later generations confirming what was already disproved.

The successor diagnosis is sharper and less comfortable: **every local task is a
deterministic assertion over repository artifacts, so it measures internal
consistency the 6,900-test suite already enforces — not capability.** Separating
the two requires a judgement the repository does not compute, which requires a
configured model provider. That is an external gate (§201, §202), not a software
gap, and no further local corpus authorship closes it.

## G2: the successor test, executed

G2's job is to recompute the bottleneck from scratch and run the successor
diagnosis's own discriminating test — *configure any model provider and run one
task whose answer the repository does not compute; if a local runtime can serve
it, the gap was authorship rather than the provider.*

G2 executed that test rather than assuming its answer. Four independent probes:

| probe | available | detail |
|---|---|---|
| provider credential | no | none in environment |
| provider doctor | no | `NO_MODEL_PROVIDER_CONFIGURED` |
| local transformers runtime | no | not installed |
| local ollama | no | no binary |

Verdict: `EXTERNAL_GATE_CONFIRMED`. Promotion: `NO_PROMOTION`. Classification:
**EXTERNAL_BLOCKED**, not a software gap.

G2 records the capability dimension as **unmeasured** rather than scoring it.
Nothing in this environment can render the judgement, and a number produced
anyway would be exactly the fabrication this spine exists to prevent. The sealed
task is still pinned in the corpus, so an environment with a provider can execute
precisely it and compare.

Three generations now exist. Velocity reports trend **FLAT** — which is correct:
G1 measured more and improved nothing, and G2 changed nothing about the system.
Acceleration remains `NOT_ESTABLISHED`.

## What this does not claim

No dimension state proves runtime quality, external outcomes, self-improvement or
ASI. `G1` measured more and improved nothing; the velocity receipt reports
`INSUFFICIENT_DATA` because two points are a line. Acceleration is
`NOT_ESTABLISHED` and cannot be established from a score series alone.
