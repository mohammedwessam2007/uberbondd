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
| OPERATING | 6 |
| VERIFIED | 16 |
| IMPLEMENTED | 2 |
| ABSENT / CANON / PARTIAL | 0 |
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

## What this does not claim

No dimension state proves runtime quality, external outcomes, self-improvement or
ASI. `G1` measured more and improved nothing; the velocity receipt reports
`INSUFFICIENT_DATA` because two points are a line. Acceleration is
`NOT_ESTABLISHED` and cannot be established from a score series alone.
